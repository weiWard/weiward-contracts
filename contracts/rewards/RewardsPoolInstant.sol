// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "./RewardsPool.sol";

contract RewardsPoolInstant is RewardsPool {
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	/* Mutable Internal State */

	uint256 internal _accruedRewardsPerToken;
	mapping(address => uint256) internal _accruedRewardsPerTokenPaid;
	uint256 internal _lastTotalRewardsAccrued;

	/* Events */

	event RecoveredUnredeemableRewards(address indexed to, uint256 amount);

	/* Constructor */

	constructor(
		IERC20 _rewardsToken,
		IERC20 _stakingToken,
		uint8 _stakingTokenDecimals
	) RewardsPool(_rewardsToken, _stakingToken, _stakingTokenDecimals) {
		return;
	}

	/* Public Views */

	// Represents a variable ratio of reward token to staking token accrued thus
	// far, multiplied by 10**stakingTokenDecimal in case of a fraction.
	function accruedRewardsPerToken() public view returns (uint256) {
		return _getAccruedRewardsPerToken(totalRewardsAccrued());
	}

	function accruedRewardsPerTokenPaid(address account)
		public
		view
		returns (uint256)
	{
		return _accruedRewardsPerTokenPaid[account];
	}

	function rewardsBalanceOf(address account)
		public
		view
		virtual
		override
		returns (uint256)
	{
		return _rewardsBalanceOfImpl(account, accruedRewardsPerToken());
	}

	function unredeemableRewards() public view returns (uint256) {
		return _rewards[address(0)];
	}

	/* Public Mutators */

	// In the event that rewards tokens are sent to the contract while there are
	// no stakers.
	function recoverUnredeemableRewards(address to, uint256 amount)
		public
		onlyOwner
	{
		_recoverUnredeemableRewards(to, amount);
	}

	/* Internal Views */

	function _getAccruedRewardsPerToken(uint256 _totalRewardsAccrued)
		internal
		view
		virtual
		returns (uint256)
	{
		uint256 totalStaked = totalStaked();
		if (totalStaked == 0) {
			return _accruedRewardsPerToken;
		}

		// Overflow is OK: delta is correct anyway
		uint256 delta = _totalRewardsAccrued - _lastTotalRewardsAccrued;
		if (delta == 0) {
			return _accruedRewardsPerToken;
		}

		// Multiply by stakingTokenBase for better rounding.
		uint256 rewardsPerToken =
			delta.mul(_getStakingTokenBase()).div(totalStaked);

		// Overflow is OK
		return _accruedRewardsPerToken + rewardsPerToken;
	}

	function _rewardsBalanceOfImpl(
		address account,
		uint256 accruedRewardsPerTokenParam
	) internal view virtual returns (uint256) {
		// Overflow is OK: delta is correct anyway
		uint256 accruedDelta =
			accruedRewardsPerTokenParam - _accruedRewardsPerTokenPaid[account];

		// Divide by stakingTokenBase to convert to rewards decimals.
		return
			stakedBalanceOf(account)
				.mul(accruedDelta)
				.div(_getStakingTokenBase())
				.add(_rewards[account]);
	}

	/* Internal Mutators */

	function _recoverUnredeemableRewards(address to, uint256 amount)
		internal
		virtual
	{
		uint256 unredeemable = unredeemableRewards();
		require(
			amount <= unredeemable,
			"RewardsPoolInstant: cannot recover more rewards than are unredeemable"
		);
		_rewards[address(0)] = unredeemable.sub(amount);
		_transferRewards(to, amount);
		emit RecoveredUnredeemableRewards(to, amount);
	}

	function _updateAccrual() internal virtual {
		uint256 rewardsAccrued = totalRewardsAccrued();

		// Allow recovery of unredeemable rewards
		if (totalStaked() == 0) {
			// Overflow is OK: delta is the same anyway
			uint256 accruedDelta = rewardsAccrued - _lastTotalRewardsAccrued;
			if (accruedDelta > 0) {
				// Assign to 0 address
				_rewards[address(0)] = _rewards[address(0)].add(accruedDelta);
			}
		}

		// Update values
		_accruedRewardsPerToken = _getAccruedRewardsPerToken(rewardsAccrued);
		_lastTotalRewardsAccrued = rewardsAccrued;
	}

	function _updateRewardFor(address account) internal virtual override {
		_updateAccrual();
		uint256 arpt = _accruedRewardsPerToken;
		// Gas savings since _updateAccrual does half the work
		_rewards[account] = _rewardsBalanceOfImpl(account, arpt);
		_accruedRewardsPerTokenPaid[account] = arpt;
	}
}
