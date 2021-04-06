// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IETHmxRewards {
	/* Views */

	function accrualUpdateInterval() external view returns (uint256);

	function accruedRewardsPerToken() external view returns (uint256);

	function accruedRewardsPerTokenLast(address account)
		external
		view
		returns (uint256);

	function ethmx() external view returns (address);

	function lastAccrualUpdate() external view returns (uint256);

	function lastRewardsBalanceOf(address account)
		external
		view
		returns (uint256);

	function lastTotalRewardsAccrued() external view returns (uint256);

	function readyForUpdate() external view returns (bool);

	function rewardsBalanceOf(address account) external view returns (uint256);

	function stakedBalanceOf(address account) external view returns (uint256);

	function totalRewardsAccrued() external view returns (uint256);

	function totalRewardsRedeemed() external view returns (uint256);

	function totalStaked() external view returns (uint256);

	function unredeemableRewards() external view returns (uint256);

	function weth() external view returns (address);

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

	function setAccrualUpdateInterval(uint256 interval) external;

	function setEthmx(address account) external;

	function setWeth(address account) external;

	function stake(uint256 amount) external;

	function unpause() external;

	function unstake(uint256 amount) external;

	function unstakeAll() external;

	function updateAccrual() external;

	function updateReward() external;

	/* Events */

	event AccrualUpdated(address indexed author, uint256 accruedRewards);
	event AccrualUpdateIntervalSet(address indexed author, uint256 interval);
	event ETHmxSet(address indexed author, address indexed account);
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
	event Staked(address indexed account, uint256 amount);
	event Unstaked(address indexed account, uint256 amount);
	event WETHSet(address indexed author, address indexed account);
}
