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

interface IRewardsManagerAuto {
	/* Views */

	function accruedRewardsPerShare() external view returns (uint256);

	function accruedRewardsPerSharePaid(address account)
		external
		view
		returns (uint256);

	function defaultRecipient() external view returns (address);

	function rewardsBalanceOf(address account) external view returns (uint256);

	function rewardsToken() external view returns (IERC20);

	function sharesFor(address account)
		external
		view
		returns (uint128 active, uint128 total);

	function totalRewardsAccrued() external view returns (uint256);

	function totalRewardsRedeemed() external view returns (uint256);

	function totalShares() external view returns (uint128);

	/* Mutators */

	function activateShares() external;

	function activateSharesFor(address account) external;

	function addShares(address account, uint128 amount) external;

	function deactivateShares() external;

	function deactivateSharesFor(address account) external;

	function recoverUnsupportedERC20(
		IERC20 token,
		address to,
		uint256 amount
	) external;

	function redeemAllRewards() external;

	function redeemReward(uint256 amount) external;

	function redeemRewardTo(address to, uint256 amount) external;

	function removeShares(address account, uint128 amount) external;

	function setDefaultRecipient(address account) external;

	function setShares(
		address account,
		uint128 value,
		bool isActive
	) external;

	function updateReward() external;

	function updateRewardFor(address account) external;

	/* Events */

	event DefaultRecipientSet(address indexed account);
	event RecoveredUnsupported(
		IERC20 indexed token,
		address indexed to,
		uint256 amount
	);
	event RewardPaid(address indexed from, address indexed to, uint256 amount);
	event SharesActivated(address indexed account);
	event SharesAdded(address indexed account, uint128 amount);
	event SharesDeactivated(address indexed account);
	event SharesRemoved(address indexed account, uint128 amount);
	event SharesSet(address indexed account, uint128 value);
}
