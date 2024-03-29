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

import "../LPRewardsAuto.sol";

contract MockLPRewardsAuto is LPRewardsAuto {
	constructor(address _rewardsToken) LPRewardsAuto(_rewardsToken) {
		return;
	}

	function multiplier() public pure returns (uint256) {
		return _MULTIPLIER;
	}

	function setAccruedRewardsPerTokenFor(address token, uint256 value) public {
		_tokenData[token].accruedRewardsPerToken = value;
	}

	function setRewardsRedeemedFor(address token, uint256 value) public {
		_tokenData[token].rewardsRedeemed = value;
	}

	function setLastRewardsAccruedFor(address token, uint256 value) public {
		_tokenData[token].lastRewardsAccrued = value;
	}

	function setLastTotalRewardsAccrued(uint256 value) public {
		_lastTotalRewardsAccrued = value;
	}

	function setTotalRewardsRedeemed(uint256 value) public {
		_totalRewardsRedeemed = value;
	}
}
