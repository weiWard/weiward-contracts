// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../interfaces/IRewardsManagerAuto.sol";

contract RewardsManagerAuto is ReentrancyGuard, Ownable, IRewardsManagerAuto {
	using SafeCast for uint256;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;
	using SafeMath for uint128;

	/* Types */

	struct Shares {
		uint128 active;
		uint128 total;
	}

	/* Immutable Public State */

	IERC20 public immutable override rewardsToken;

	/* Mutable Internal State */

	uint256 internal _accruedRewardsPerShare;
	mapping(address => uint256) internal _accruedRewardsPerSharePaid;
	address internal _defaultRecipient;
	uint256 internal _lastTotalRewardsAccrued;
	mapping(address => uint256) internal _rewards;
	uint256 internal _totalRewardsRedeemed;
	mapping(address => Shares) internal _shares;
	uint128 internal _totalActiveShares;
	uint128 internal _totalShares;

	/* Constructor */

	constructor(IERC20 _rewardsToken) Ownable() {
		rewardsToken = _rewardsToken;
	}

	/* External Mutators */

	function activateShares() external override {
		_activate(_msgSender());
	}

	function activateSharesFor(address account) external override onlyOwner {
		_activate(account);
	}

	function addShares(address account, uint128 amount)
		external
		override
		onlyOwner
	{
		require(
			account != address(0),
			"RewardsManagerAuto: cannot add shares to the zero address"
		);
		_addShares(account, amount);
	}

	function deactivateShares() external override {
		_deactivate(_msgSender());
	}

	function deactivateSharesFor(address account) external override onlyOwner {
		_deactivate(account);
	}

	function recoverUnsupportedERC20(
		IERC20 token,
		address to,
		uint256 amount
	) external override onlyOwner {
		_recoverUnsupportedERC20(token, to, amount);
	}

	function removeShares(address account, uint128 amount)
		external
		override
		onlyOwner
	{
		_removeShares(account, amount);
	}

	function setShares(
		address account,
		uint128 value,
		bool isActive
	) external override onlyOwner {
		require(
			account != address(0),
			"RewardsManagerAuto: cannot set shares for zero address"
		);
		_setShares(account, value, isActive);
	}

	function setDefaultRecipient(address account) external override onlyOwner {
		require(
			account != address(0),
			"RewardsManagerAuto: cannot set zero address as the default recipient"
		);
		require(
			account != address(this),
			"RewardsManagerAuto: cannot use this contract as the default recipient"
		);
		_setDefaultRecipient(account);
	}

	/* Public Views */

	function accruedRewardsPerShare() public view override returns (uint256) {
		return _getAccruedRewardsPerShare(totalRewardsAccrued());
	}

	function accruedRewardsPerSharePaid(address account)
		public
		view
		override
		returns (uint256)
	{
		return _accruedRewardsPerSharePaid[account];
	}

	function defaultRecipient() public view override returns (address) {
		return _defaultRecipient;
	}

	function rewardsBalanceOf(address account)
		public
		view
		override
		returns (uint256)
	{
		return _rewardsBalanceOfImpl(account, accruedRewardsPerShare());
	}

	function sharesFor(address account)
		public
		view
		override
		returns (uint128 active, uint128 total)
	{
		Shares storage s = _shares[account];
		return (s.active, s.total);
	}

	function totalRewardsAccrued() public view override returns (uint256) {
		// Overflow is OK
		return rewardsToken.balanceOf(address(this)) + _totalRewardsRedeemed;
	}

	function totalRewardsRedeemed() public view override returns (uint256) {
		return _totalRewardsRedeemed;
	}

	function totalShares() public view override returns (uint128) {
		return _totalShares;
	}

	/* Public Mutators */

	function redeemAllRewards() public override nonReentrant {
		_redeemAllRewards();
	}

	function redeemReward(uint256 amount) public override nonReentrant {
		_redeemRewardTo(_msgSender(), amount);
	}

	function redeemRewardTo(address to, uint256 amount)
		public
		override
		nonReentrant
	{
		_redeemRewardTo(to, amount);
	}

	function updateReward() public override {
		_updateRewardFor(_msgSender());
	}

	function updateRewardFor(address account) public override {
		_updateRewardFor(account);
	}

	/* Internal Views */

	function _getAccruedRewardsPerShare(uint256 _totalRewardsAccrued)
		internal
		view
		virtual
		returns (uint256)
	{
		if (_totalActiveShares == 0) {
			return _accruedRewardsPerShare;
		}

		// Overflow is OK: delta is correct anyway
		uint256 delta = _totalRewardsAccrued - _lastTotalRewardsAccrued;
		if (delta == 0) {
			return _accruedRewardsPerShare;
		}

		// Multiply by 1e18 for better rounding.
		uint256 rewardsPerShare = delta.mul(1e18).div(_totalActiveShares);

		// Overflow is OK
		return _accruedRewardsPerShare + rewardsPerShare;
	}

	function _rewardsBalanceOfImpl(
		address account,
		uint256 accruedRewardsPerShareParam
	) internal view virtual returns (uint256) {
		// Overflow is OK: delta is correct anyway
		uint256 accruedDelta =
			accruedRewardsPerShareParam - _accruedRewardsPerSharePaid[account];

		// Divide by 1e18 to convert to rewards decimals.
		return
			_shares[account].active.mul(accruedDelta).div(1e18).add(
				_rewards[account]
			);
	}

	/* Internal Mutators */

	function _activate(address account) internal virtual {
		Shares storage s = _shares[account];

		// Do nothing if already active
		if (s.active > 0) {
			return;
		}

		Shares storage d = _shares[_defaultRecipient];

		s.active = s.total;
		d.active = d.active.sub(s.total).toUint128();
		emit SharesActivated(account);
	}

	function _addShares(address account, uint128 amount) internal virtual {
		Shares storage s = _shares[account];
		if (s.active == 0) {
			// Add to inactive value
			Shares storage d = _shares[_defaultRecipient];
			d.active = d.active.add(amount).toUint128();
		} else {
			s.active = s.active.add(amount).toUint128();
		}
		s.total = s.total.add(amount).toUint128();
		emit SharesAdded(account, amount);
	}

	function _deactivate(address account) internal virtual {
		// Skip for the default recipient
		if (account == _defaultRecipient) {
			return;
		}

		Shares storage s = _shares[account];

		// Do nothing if already deactivated
		if (s.active == 0) {
			return;
		}

		Shares storage d = _shares[_defaultRecipient];

		s.active = 0;
		d.active = d.active.add(s.total).toUint128();
		emit SharesDeactivated(account);
	}

	function _recoverUnsupportedERC20(
		IERC20 token,
		address to,
		uint256 amount
	) internal virtual {
		require(
			token != rewardsToken,
			"RewardsManagerAuto: cannot recover the rewards token"
		);
		token.safeTransfer(to, amount);
		emit RecoveredUnsupported(token, to, amount);
	}

	function _redeemAllRewards() internal virtual {
		address account = _msgSender();
		_updateRewardFor(account);
		_redeemRewardToImpl(account, account, _rewards[account]);
	}

	function _redeemRewardTo(address to, uint256 amount) internal virtual {
		address from = _msgSender();
		_updateRewardFor(from);
		require(
			amount <= _rewards[from],
			"RewardsManagerAuto: cannot redeem more rewards than you have earned"
		);
		_redeemRewardToImpl(from, to, amount);
	}

	function _redeemRewardToImpl(
		address from,
		address to,
		uint256 amount
	) internal virtual {
		if (amount == 0) {
			return;
		}
		// Overflow is OK
		_totalRewardsRedeemed += amount;
		_rewards[from] = _rewards[from].sub(amount);
		rewardsToken.safeTransfer(to, amount);
		emit RewardPaid(from, to, amount);
	}

	function _removeShares(address account, uint128 amount) internal virtual {
		Shares storage s = _shares[account];
		if (s.active == 0) {
			// Remove from inactive value
			Shares storage d = _shares[_defaultRecipient];
			d.active = d.active.sub(amount).toUint128();
		} else {
			s.active = s.active.sub(amount).toUint128();
		}
		s.total = s.total.sub(amount).toUint128();
		emit SharesRemoved(account, amount);
	}

	function _setDefaultRecipient(address account) internal virtual {
		// Activate
		_activate(account);

		// Move any inactive shares
		{
			Shares storage original = _shares[_defaultRecipient];
			if (original.active > original.total) {
				uint128 inactive = original.active - original.total;
				original.active -= inactive;

				Shares storage next = _shares[account];
				next.active = next.active.add(inactive).toUint128();
			}
		}

		_defaultRecipient = account;
		emit DefaultRecipientSet(account);
	}

	function _setShares(
		address account,
		uint128 value,
		bool isActive
	) internal virtual {
		Shares storage s = _shares[account];
		Shares storage d = _shares[_defaultRecipient];

		if (s.active == 0) {
			// Subtract old inactive value
			d.active = d.active.sub(s.total).toUint128();
		}

		if (!isActive) {
			// Add new inactive value
			d.active = d.active.add(value).toUint128();
		} else {
			s.active = value;
		}

		s.total = value;
		emit SharesSet(account, value);
	}

	function _updateAccrual() internal virtual {
		uint256 rewardsAccrued = totalRewardsAccrued();
		_accruedRewardsPerShare = _getAccruedRewardsPerShare(rewardsAccrued);
		_lastTotalRewardsAccrued = rewardsAccrued;
	}

	function _updateRewardFor(address account) internal virtual {
		_updateAccrual();
		uint256 arps = _accruedRewardsPerShare;
		// Gas savings since _updateAccrual does half the work
		_rewards[account] = _rewardsBalanceOfImpl(account, arps);
		_accruedRewardsPerSharePaid[account] = arps;
	}
}
