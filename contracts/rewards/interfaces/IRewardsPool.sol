// SPDX-License-Identifier: Apache-2.0

/**
 * Copyright 2021 weiWard LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
