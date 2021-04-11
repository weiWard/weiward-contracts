// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/utils/Arrays.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../tokens/interfaces/IETHmx.sol";
import "./interfaces/IETHmxRewards.sol";

// High accuracy in block.timestamp is not needed.
// https://consensys.github.io/smart-contract-best-practices/recommendations/#the-15-second-rule
/* solhint-disable not-rely-on-time */

contract ETHmxRewards is Ownable, Pausable, IETHmxRewards {
	using Arrays for uint256[];
	using Counters for Counters.Counter;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	/* Mutable Internal State */

	address internal _ethmx;
	address internal _weth;

	uint256[] internal _arptSnapshots;
	mapping(address => uint256) internal _arptLastIdx;

	uint256 internal _lastAccrualUpdate;
	uint256 internal _accrualUpdateInterval;

	mapping(address => uint256) internal _rewardsFor;
	uint256 internal _lastTotalRewardsAccrued;
	uint256 internal _totalRewardsRedeemed;

	mapping(address => uint256) internal _stakedFor;
	uint256 internal _totalStaked;

	/* Immutable Internal State */

	uint256 internal constant _MULTIPLIER = 1e36;

	/* Constructor */

	constructor(
		address owner_,
		address ethmx_,
		address weth_,
		uint256 accrualUpdateInterval_
	) Ownable() {
		setEthmx(ethmx_);
		setWeth(weth_);
		_arptSnapshots.push(0);
		setAccrualUpdateInterval(accrualUpdateInterval_);
		if (owner_ != owner()) {
			transferOwnership(owner_);
		}
	}

	/* Public Views */

	function accrualUpdateInterval() external view override returns (uint256) {
		return _accrualUpdateInterval;
	}

	function accruedRewardsPerToken() public view override returns (uint256) {
		return _arptSnapshots[_arptSnapshots.length - 1];
	}

	function accruedRewardsPerTokenLast(address account)
		public
		view
		override
		returns (uint256)
	{
		return _arptSnapshots[_arptLastIdx[account]];
	}

	function ethmx() public view override returns (address) {
		return _ethmx;
	}

	function lastAccrualUpdate() external view override returns (uint256) {
		return _lastAccrualUpdate;
	}

	function lastRewardsBalanceOf(address account)
		external
		view
		override
		returns (uint256)
	{
		return _rewardsFor[account];
	}

	function lastTotalRewardsAccrued() public view override returns (uint256) {
		return _lastTotalRewardsAccrued;
	}

	function readyForUpdate() external view override returns (bool) {
		if (_lastAccrualUpdate > block.timestamp) {
			return false;
		}
		uint256 timePassed = block.timestamp - _lastAccrualUpdate;
		return timePassed >= _accrualUpdateInterval;
	}

	function rewardsBalanceOf(address account)
		external
		view
		override
		returns (uint256)
	{
		// Gas savings
		uint256 rewards = _rewardsFor[account];
		uint256 staked = _stakedFor[account];

		if (staked == 0) {
			return rewards;
		}

		uint256[] memory arptValues = _arptSnapshots;
		uint256 length = arptValues.length;
		uint256 arpt = arptValues[length - 1];
		uint256 lastIdx = _arptLastIdx[account];
		uint256 arptDelta = arpt - arptValues[lastIdx];

		if (arptDelta == 0) {
			return rewards;
		}

		// Calculate reward and new stake
		uint256 currentRewards = 0;
		for (uint256 i = lastIdx + 1; i < length; i++) {
			arptDelta = arptValues[i] - arptValues[i - 1];
			if (arptDelta >= _MULTIPLIER) {
				// This should handle any plausible overflow
				rewards += staked;
				staked = 0;
				break;
			}
			currentRewards = staked.mul(arptDelta) / _MULTIPLIER;
			rewards += currentRewards;
			staked -= currentRewards;
		}

		return rewards;
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

	function weth() public view override returns (address) {
		return _weth;
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
		IERC20(weth()).safeTransfer(to, amount);
		emit RecoveredUnredeemableRewards(_msgSender(), to, amount);
	}

	function recoverUnstaked(address to, uint256 amount)
		public
		override
		onlyOwner
	{
		IERC20 ethmxHandle = IERC20(ethmx());
		uint256 unstaked = ethmxHandle.balanceOf(address(this)).sub(_totalStaked);

		require(
			amount <= unstaked,
			"ETHmxRewards: recovery amount greater than unstaked"
		);

		ethmxHandle.safeTransfer(to, amount);
		emit RecoveredUnstaked(_msgSender(), to, amount);
	}

	function recoverUnsupportedERC20(
		address token,
		address to,
		uint256 amount
	) public override onlyOwner {
		require(token != ethmx(), "ETHmxRewards: cannot recover ETHmx");
		require(token != weth(), "ETHmxRewards: cannot recover WETH");
		IERC20(token).safeTransfer(to, amount);
		emit RecoveredUnsupported(_msgSender(), token, to, amount);
	}

	function redeemAllRewards() public override {
		address account = _msgSender();
		_updateRewardFor(account);
		_redeemReward(account, _rewardsFor[account]);
	}

	function redeemReward(uint256 amount) public override {
		require(amount != 0, "ETHmxRewards: cannot redeem zero");
		address account = _msgSender();
		// Update reward first (since it only goes up)
		_updateRewardFor(account);
		require(
			amount <= _rewardsFor[account],
			"ETHmxRewards: cannot redeem more rewards than earned"
		);
		_redeemReward(account, amount);
	}

	function setAccrualUpdateInterval(uint256 interval)
		public
		override
		onlyOwner
	{
		_accrualUpdateInterval = interval;
		emit AccrualUpdateIntervalSet(_msgSender(), interval);
	}

	function setEthmx(address account) public override onlyOwner {
		_ethmx = account;
		emit ETHmxSet(_msgSender(), account);
	}

	function setWeth(address account) public override onlyOwner {
		_weth = account;
		emit WETHSet(_msgSender(), account);
	}

	function stake(uint256 amount) public override whenNotPaused {
		require(amount != 0, "ETHmxRewards: cannot stake zero");

		address account = _msgSender();
		_updateRewardFor(account);

		_stakedFor[account] = _stakedFor[account].add(amount);
		_totalStaked = _totalStaked.add(amount);

		IERC20(ethmx()).safeTransferFrom(account, address(this), amount);
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
		uint256 timePassed =
			block.timestamp.sub(
				_lastAccrualUpdate,
				"ETHmxRewards: block is older than last accrual update"
			);
		require(
			timePassed >= _accrualUpdateInterval,
			"ETHmxRewards: too soon to update accrual"
		);

		_updateAccrual();
	}

	function updateReward() public override {
		_updateRewardFor(_msgSender());
	}

	/* Internal Views */

	function _currentRewardsBalance() internal view returns (uint256) {
		return IERC20(weth()).balanceOf(address(this));
	}

	/* Internal Mutators */

	function _burnETHmx(uint256 amount) internal {
		_totalStaked = _totalStaked.sub(amount);
		IETHmx(ethmx()).burn(amount);
	}

	function _redeemReward(address account, uint256 amount) internal {
		// Should be guaranteed safe by caller (gas savings)
		_rewardsFor[account] -= amount;
		// Overflow is OK
		_totalRewardsRedeemed += amount;

		IERC20(weth()).safeTransfer(account, amount);

		emit RewardPaid(account, amount);
	}

	function _unstake(address account, uint256 amount) internal {
		if (amount == 0) {
			return;
		}

		// Should be guaranteed safe by caller
		_stakedFor[account] -= amount;
		_totalStaked = _totalStaked.sub(amount);

		IERC20(ethmx()).safeTransfer(account, amount);
		emit Unstaked(account, amount);
	}

	function _updateAccrual() internal {
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
			uint256 arpt = accruedRewardsPerToken();
			arpt += newRewards.mul(_MULTIPLIER) / tstaked;
			_arptSnapshots.push(arpt);
			_burnETHmx(newRewards);
		} else {
			uint256 leftover = newRewards - tstaked;
			// Assign excess to zero address
			_rewardsFor[address(0)] = _rewardsFor[address(0)].add(leftover);

			if (tstaked != 0) {
				uint256 arpt = accruedRewardsPerToken();
				// newRewards when tokens == totalStaked
				arpt += _MULTIPLIER;
				_arptSnapshots.push(arpt);
				_burnETHmx(tstaked);
			}
		}

		_lastTotalRewardsAccrued = rewardsAccrued;
		_lastAccrualUpdate = block.timestamp;
		emit AccrualUpdated(_msgSender(), rewardsAccrued);
	}

	function _updateRewardFor(address account) internal {
		// Gas savings
		uint256[] memory arptValues = _arptSnapshots;
		uint256 length = arptValues.length;
		uint256 arpt = arptValues[length - 1];
		uint256 lastIdx = _arptLastIdx[account];
		uint256 arptDelta = arpt - arptValues[lastIdx];
		uint256 staked = _stakedFor[account];

		_arptLastIdx[account] = length - 1;

		if (staked == 0 || arptDelta == 0) {
			return;
		}

		// Calculate reward and new stake
		uint256 currentRewards = 0;
		uint256 newRewards = 0;
		for (uint256 i = lastIdx + 1; i < length; i++) {
			arptDelta = arptValues[i] - arptValues[i - 1];
			if (arptDelta >= _MULTIPLIER) {
				// This should handle any plausible overflow
				newRewards += staked;
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
}
