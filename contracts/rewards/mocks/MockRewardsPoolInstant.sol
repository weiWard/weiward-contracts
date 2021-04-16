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
