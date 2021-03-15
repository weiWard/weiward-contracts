// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface ILPRewardsAuto {
	/* Views */

	function accruedRewardsPerTokenFor(address token)
		external
		view
		returns (uint256);

	function accruedRewardsPerTokenPaidFor(address account, address token)
		external
		view
		returns (uint256);

	function currentAccruedRewardsPerTokenFor(address token)
		external
		view
		returns (uint256);

	function currentRewardsBalanceOf(address account)
		external
		view
		returns (uint256);

	function currentRewardsBalanceOfFor(address account, address token)
		external
		view
		returns (uint256);

	function currentSharesFor(address token) external view returns (uint256);

	function currentSharesOf(address account) external view returns (uint256);

	function currentSharesOfFor(address account, address token)
		external
		view
		returns (uint256);

	function currentSharesPerTokenFor(address token)
		external
		view
		returns (uint256);

	function currentTotalRewardsAccruedFor(address token)
		external
		view
		returns (uint256);

	function currentTotalShares() external view returns (uint256);

	function numStakingTokens() external view returns (uint256);

	function rewardsBalanceOf(address account) external view returns (uint256);

	function rewardsBalanceOfFor(address account, address token)
		external
		view
		returns (uint256);

	function rewardsFor(address token) external view returns (uint256);

	function rewardsRedeemedBy(address account) external view returns (uint256);

	function rewardsRedeemedByFor(address account, address token)
		external
		view
		returns (uint256);

	function rewardsToken() external view returns (address);

	function stakedBalanceOfFor(address account, address token)
		external
		view
		returns (uint256);

	function stakingTokenAt(uint256 index) external view returns (address);

	function supportsStakingToken(address token) external view returns (bool);

	function totalRewardsAccrued() external view returns (uint256);

	function totalRewardsAccruedFor(address token)
		external
		view
		returns (uint256);

	function totalRewardsRedeemed() external view returns (uint256);

	function totalRewardsRedeemedFor(address token)
		external
		view
		returns (uint256);

	function totalStakedFor(address token) external view returns (uint256);

	function valuePerTokenImplFor(address token) external view returns (address);

	/* Mutators */

	function addToken(address token, address tokenValueImpl) external;

	function changeTokenValueImpl(address token, address tokenValueImpl)
		external;

	function exit() external;

	function exitFrom(address token) external;

	function pause() external;

	function recoverUnstaked(
		address token,
		address to,
		uint256 amount
	) external;

	function redeemAllRewards() external;

	function redeemAllRewardsFrom(address token) external;

	function redeemReward(uint256 amount) external;

	function redeemRewardFrom(address token, uint256 amount) external;

	function removeToken(address token) external;

	function stake(address token, uint256 amount) external;

	function unpause() external;

	function unstake(address token, uint256 amount) external;

	function unstakeAll() external;

	function unstakeAllFrom(address token) external;

	function updateReward() external;

	function updateRewardFor(address account) external;

	function updateTokenRewards() external;

	/* Events */

	event RecoveredUnstaked(
		address indexed token,
		address indexed to,
		uint256 amount
	);
	event RewardPaid(address indexed account, uint256 amount);
	event Staked(address indexed account, uint256 amount);
	event Unstaked(address indexed account, uint256 amount);
	event TokenAdded(address indexed token, address indexed tokenValueImpl);
	event TokenRemoved(address indexed token);
	event TokenValueImplChanged(
		address indexed token,
		address indexed tokenValueImpl
	);
}
