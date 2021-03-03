// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface IETHmxRewards {
	/* Views */

	function accruedRewardsPerToken() external view returns (uint256);

	function accruedRewardsPerTokenLast(address account)
		external
		view
		returns (uint256);

	function ethmxAddr() external view returns (address);

	function lastTotalRewardsAccrued() external view returns (uint256);

	function rewardsBalanceOf(address account) external view returns (uint256);

	function stakedBalanceOf(address account) external view returns (uint256);

	function totalRewardsAccrued() external view returns (uint256);

	function totalRewardsRedeemed() external view returns (uint256);

	function totalStaked() external view returns (uint256);

	function unredeemableRewards() external view returns (uint256);

	function wethAddr() external view returns (address);

	/* Mutators */

	function exit() external;

	function pause() external;

	function recoverUnredeemableRewards(address to, uint256 amount) external;

	function recoverUnstaked(address to, uint256 amount) external;

	function recoverUnsupportedERC20(
		address token,
		address to,
		uint256 amount
	) external;

	function redeemAllRewards() external;

	function redeemReward(uint256 amount) external;

	function stake(uint256 amount) external;

	function unpause() external;

	function unstake(uint256 amount) external;

	function unstakeAll() external;

	function updateAccrual() external;

	function updateReward() external;

	/* Events */

	event RecoveredUnredeemableRewards(
		address indexed author,
		address indexed to,
		uint256 amount
	);
	event RecoveredUnstaked(
		address indexed author,
		address indexed to,
		uint256 amount
	);
	event RecoveredUnsupported(
		address indexed author,
		address indexed token,
		address indexed to,
		uint256 amount
	);
	event RewardPaid(address indexed to, uint256 amount);
	event Snapshot(uint256 id);
	event Staked(address indexed account, uint256 amount);
	event Unstaked(address indexed account, uint256 amount);
}
