// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/utils/Arrays.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../tokens/interfaces/IETHmx.sol";
import "./interfaces/IETHmxRewards.sol";

contract ETHmxRewards is Ownable, Pausable, IETHmxRewards {
	using Arrays for uint256[];
	using Counters for Counters.Counter;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	/* Structs */

	struct Snapshots {
		uint256[] ids;
		uint256[] values;
	}

	/* Immutable Public State */

	address public immutable override ethmxAddr;
	address public immutable override wethAddr;

	/* Mutable Internal State */

	Snapshots internal _arptSnapshots;
	Counters.Counter internal _currentSnapshotId;
	mapping(address => uint256) internal _arptLastId;

	uint256 internal _lastTotalRewardsAccrued;
	mapping(address => uint256) internal _rewardsFor;
	mapping(address => uint256) internal _stakedFor;
	uint256 internal _totalRewardsRedeemed;
	uint256 internal _totalStaked;

	/* Immutable Internal State */

	uint256 internal constant _MULTIPLIER = 1e36;

	/* Constructor */

	constructor(address ethmxAddr_, address wethAddr_) Ownable() {
		ethmxAddr = ethmxAddr_;
		wethAddr = wethAddr_;
		_snapshot();
		_updateArptSnapshot(0);
	}

	/* Public Views */

	function accruedRewardsPerToken() public view override returns (uint256) {
		return _lastSnapshotId(_arptSnapshots.values);
	}

	function accruedRewardsPerTokenLast(address account)
		public
		view
		override
		returns (uint256)
	{
		uint256 id = _arptLastId[account];
		if (id == 0) {
			return 0;
		}
		(, uint256 value) = _valueAt(id, _arptSnapshots);
		return value;
	}

	function lastTotalRewardsAccrued() public view override returns (uint256) {
		return _lastTotalRewardsAccrued;
	}

	function rewardsBalanceOf(address account)
		public
		view
		override
		returns (uint256)
	{
		return _rewardsFor[account];
	}

	function stakedBalanceOf(address account)
		public
		view
		override
		returns (uint256)
	{
		return _stakedFor[account];
	}

	function totalRewardsAccrued() public view override returns (uint256) {
		// Overflow is OK
		return _currentRewardsBalance() + _totalRewardsRedeemed;
	}

	function totalRewardsRedeemed() public view override returns (uint256) {
		return _totalRewardsRedeemed;
	}

	function totalStaked() public view override returns (uint256) {
		return _totalStaked;
	}

	function unredeemableRewards() public view override returns (uint256) {
		return _rewardsFor[address(0)];
	}

	/* Public Mutators */

	function exit() public override {
		address account = _msgSender();
		unstakeAll();
		_redeemReward(account, _rewardsFor[account]);
	}

	function pause() public override onlyOwner {
		_pause();
	}

	function recoverUnredeemableRewards(address to, uint256 amount)
		public
		override
		onlyOwner
	{
		require(
			amount <= _rewardsFor[address(0)],
			"ETHmxRewards: recovery amount greater than unredeemable"
		);
		_rewardsFor[address(0)] -= amount;
		IERC20(wethAddr).safeTransfer(to, amount);
		emit RecoveredUnredeemableRewards(_msgSender(), to, amount);
	}

	function recoverUnstaked(address to, uint256 amount)
		public
		override
		onlyOwner
	{
		uint256 unstaked =
			IERC20(ethmxAddr).balanceOf(address(this)).sub(_totalStaked);

		require(
			amount <= unstaked,
			"ETHmxRewards: recovery amount greater than unstaked"
		);

		IERC20(ethmxAddr).safeTransfer(to, amount);
		emit RecoveredUnstaked(_msgSender(), to, amount);
	}

	function recoverUnsupportedERC20(
		address token,
		address to,
		uint256 amount
	) public override onlyOwner {
		require(token != ethmxAddr, "ETHmxRewards: cannot recover ETHmx");
		require(token != wethAddr, "ETHmxRewards: cannot recover WETH");
		IERC20(token).safeTransfer(to, amount);
		emit RecoveredUnsupported(_msgSender(), token, to, amount);
	}

	function redeemAllRewards() public override {
		address account = _msgSender();
		_updateRewardFor(account);
		_redeemReward(account, _rewardsFor[account]);
	}

	function redeemReward(uint256 amount) public override {
		address account = _msgSender();
		// Update reward first (since it only goes up)
		_updateRewardFor(account);
		require(
			amount <= _rewardsFor[account],
			"ETHmxRewards: cannot redeem more rewards than earned"
		);
		_redeemReward(account, amount);
	}

	function stake(uint256 amount) public override whenNotPaused {
		require(amount != 0, "ETHmxRewards: cannot stake zero");

		address account = _msgSender();
		_updateRewardFor(account);
		IERC20(ethmxAddr).safeTransferFrom(account, address(this), amount);

		_stakedFor[account] = _stakedFor[account].add(amount);
		_totalStaked = _totalStaked.add(amount);

		emit Staked(account, amount);
	}

	function unpause() public override onlyOwner {
		_unpause();
	}

	function unstake(uint256 amount) public override {
		require(amount != 0, "ETHmxRewards: cannot unstake zero");
		address account = _msgSender();

		// Check against initial stake (since it only goes down)
		require(
			amount <= _stakedFor[account],
			"ETHmxRewards: cannot unstake more than staked balance"
		);

		// Update stake
		_updateRewardFor(account);
		// Cap amount with updated stake
		uint256 staked = _stakedFor[account];
		if (amount > staked) {
			amount = staked;
		}

		_unstake(account, amount);
	}

	function unstakeAll() public override {
		address account = _msgSender();
		// Update stake first
		_updateRewardFor(account);
		_unstake(account, _stakedFor[account]);
	}

	function updateAccrual() public override {
		uint256 rewardsAccrued = totalRewardsAccrued();
		// Overflow is OK
		uint256 newRewards = rewardsAccrued - _lastTotalRewardsAccrued;

		if (newRewards == 0) {
			return;
		}

		// Gas savings
		uint256 tstaked = _totalStaked;

		if (newRewards < tstaked) {
			// Add breathing room for better rounding, overflow is OK
			_addToAndSnapshotArpt(newRewards.mul(_MULTIPLIER) / tstaked);
			_burnETHmx(newRewards);
		} else {
			uint256 leftover = newRewards - tstaked;
			// Assign excess to zero address
			_rewardsFor[address(0)] = _rewardsFor[address(0)].add(leftover);

			if (tstaked != 0) {
				// newRewards when tokens == totalStaked
				_addToAndSnapshotArpt(_MULTIPLIER);
				_burnETHmx(tstaked);
			}
		}

		_lastTotalRewardsAccrued = rewardsAccrued;
	}

	function updateReward() public override {
		_updateRewardFor(_msgSender());
	}

	/* Internal Views */

	function _currentRewardsBalance() internal view returns (uint256) {
		return IERC20(wethAddr).balanceOf(address(this));
	}

	function _lastSnapshotId(uint256[] storage ids)
		internal
		view
		returns (uint256)
	{
		uint256 length = ids.length;
		if (length == 0) {
			return 0;
		} else {
			return ids[length - 1];
		}
	}

	/* Internal Mutators */

	function _addToAndSnapshotArpt(uint256 amount) internal returns (uint256) {
		uint256 arpt = accruedRewardsPerToken() + amount;
		_snapshot();
		_updateArptSnapshot(arpt);
		return arpt;
	}

	function _burnETHmx(uint256 amount) internal {
		_totalStaked = _totalStaked.sub(amount);
		IETHmx(ethmxAddr).burn(amount);
	}

	function _redeemReward(address account, uint256 amount) internal {
		// Should be guaranteed safe by caller (gas savings)
		_rewardsFor[account] -= amount;
		// Overflow is OK
		_totalRewardsRedeemed += amount;

		IERC20(wethAddr).safeTransfer(account, amount);

		emit RewardPaid(account, amount);
	}

	function _snapshot() internal returns (uint256) {
		_currentSnapshotId.increment();

		uint256 currentId = _currentSnapshotId.current();
		emit Snapshot(currentId);
		return currentId;
	}

	function _unstake(address account, uint256 amount) internal {
		if (amount == 0) {
			return;
		}

		// Should be guaranteed safe by caller
		_stakedFor[account] -= amount;
		_totalStaked = _totalStaked.sub(amount);

		IERC20(ethmxAddr).safeTransfer(account, amount);
		emit Unstaked(account, amount);
	}

	function _updateArptSnapshot(uint256 value) internal {
		_updateSnapshot(_arptSnapshots, value);
	}

	function _updateRewardFor(address account) internal {
		uint256 arpt = accruedRewardsPerToken();
		uint256 arptDelta = arpt - accruedRewardsPerTokenLast(account);
		uint256 staked = _stakedFor[account];
		uint256 lastId = _arptLastId[account];

		_arptLastId[account] = _lastSnapshotId(_arptSnapshots.ids);

		if (staked == 0 || arptDelta == 0) {
			return;
		}

		// Calculate reward and new stake
		uint256 currentRewards = 0;
		uint256 newRewards = 0;
		uint256 index = _arptSnapshots.ids.findUpperBound(lastId);
		uint256[] memory values = _arptSnapshots.values;
		for (uint256 i = index + 1; i < values.length; i++) {
			arptDelta = values[i] - values[i - 1];
			if (arptDelta >= _MULTIPLIER) {
				// This should handle any plausible overflow
				newRewards = staked;
				staked = 0;
				break;
			}
			currentRewards = staked.mul(arptDelta) / _MULTIPLIER;
			newRewards += currentRewards;
			staked -= currentRewards;
		}

		// Update state
		_stakedFor[account] = staked;
		_rewardsFor[account] = _rewardsFor[account].add(newRewards);
	}

	function _updateSnapshot(Snapshots storage snapshots, uint256 currentValue)
		internal
	{
		uint256 currentId = _currentSnapshotId.current();
		if (_lastSnapshotId(snapshots.ids) < currentId) {
			snapshots.ids.push(currentId);
			snapshots.values.push(currentValue);
		}
	}

	function _valueAt(uint256 snapshotId, Snapshots storage snapshots)
		internal
		view
		returns (bool, uint256)
	{
		require(snapshotId > 0, "ETHmxRewards: id is 0");
		require(
			snapshotId <= _currentSnapshotId.current(),
			"ETHmxRewards: nonexistent id"
		);

		uint256 index = snapshots.ids.findUpperBound(snapshotId);

		if (index == snapshots.ids.length) {
			return (false, 0);
		} else {
			return (true, snapshots.values[index]);
		}
	}
}
