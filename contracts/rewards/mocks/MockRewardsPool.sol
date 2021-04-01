// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../RewardsPool.sol";

contract MockRewardsPool is RewardsPool {
	constructor(
		IERC20 _rewardsToken,
		IERC20 _stakingToken,
		uint8 _stakingTokenDecimals
	) RewardsPool(_rewardsToken, _stakingToken, _stakingTokenDecimals) {
		return;
	}

	function rewardsBalanceOf(address) public pure override returns (uint256) {
		return 0;
	}

	function stakingTokenBase() public view returns (uint256) {
		return _getStakingTokenBase();
	}

	function _updateRewardFor(address) internal pure override {
		return;
	}
}
