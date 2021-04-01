// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IRewardsPool {
	/* Views */

	function rewardsBalanceOf(address account) external view returns (uint256);

	function rewardsRedeemedBy(address account) external view returns (uint256);

	function rewardsToken() external view returns (IERC20);

	function stakedBalanceOf(address account) external view returns (uint256);

	function stakingToken() external view returns (IERC20);

	function stakingTokenDecimals() external view returns (uint8);

	function totalRewardsAccrued() external view returns (uint256);

	function totalRewardsRedeemed() external view returns (uint256);

	function totalStaked() external view returns (uint256);

	/* Mutators */

	function exit() external;

	function pause() external;

	function recoverUnstakedTokens(address to, uint256 amount) external;

	function recoverUnsupportedERC20(
		IERC20 token,
		address to,
		uint256 amount
	) external;

	function redeemAllRewards() external;

	function redeemReward(uint256 amount) external;

	function stake(uint256 amount) external;

	function unpause() external;

	function unstake(uint256 amount) external;

	function unstakeAll() external;

	function updateReward() external;

	function updateRewardFor(address account) external;

	/* Events */

	event RecoveredUnsupported(
		IERC20 indexed token,
		address indexed to,
		uint256 amount
	);
	event RecoveredUnstaked(address indexed to, uint256 amount);
	event RewardPaid(address indexed account, uint256 amount);
	event Staked(address indexed account, uint256 amount);
	event Unstaked(address indexed account, uint256 amount);
}
