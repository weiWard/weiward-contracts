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
