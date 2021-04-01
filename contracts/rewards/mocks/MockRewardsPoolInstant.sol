// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../RewardsPoolInstant.sol";

contract MockRewardsPoolInstant is RewardsPoolInstant {
	constructor(
		IERC20 _rewardsToken,
		IERC20 _stakingToken,
		uint8 _stakingTokenDecimals
	) RewardsPoolInstant(_rewardsToken, _stakingToken, _stakingTokenDecimals) {
		return;
	}

	/* Public Views */

	function stakingTokenBase() public view returns (uint256) {
		return _getStakingTokenBase();
	}

	/* Public Mutators */

	function setAccruedRewardsPerToken(uint256 value) public {
		_accruedRewardsPerToken = value;
	}

	function increaseAccruedRewardsPerToken(uint256 amount) public {
		_accruedRewardsPerToken += amount;
	}

	function setAccruedRewardsPerTokenPaid(address account, uint256 value)
		public
	{
		_accruedRewardsPerTokenPaid[account] = value;
	}

	function increaseAccruedRewardsPerTokenPaid(address account, uint256 amount)
		public
	{
		_accruedRewardsPerTokenPaid[account] += amount;
	}

	function setLastTotalRewardsAccrued(uint256 value) public {
		_lastTotalRewardsAccrued = value;
	}

	function increaseLastTotalRewardsAccrued(uint256 amount) public {
		_lastTotalRewardsAccrued += amount;
	}

	function setRewardsRedeemed(uint256 value) public {
		_rewardsRedeemed = value;
	}

	function increaseRewardsRedeemed(uint256 amount) public {
		_rewardsRedeemed += amount;
	}

	function setRewardsRedeemedBy(address account, uint256 value) public {
		_rewardsRedeemedBy[account] = value;
	}

	function increaseRewardsRedeemedBy(address account, uint256 amount) public {
		_rewardsRedeemedBy[account] += amount;
	}
}
