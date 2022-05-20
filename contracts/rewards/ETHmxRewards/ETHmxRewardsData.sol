// SPDX-License-Identifier: Apache-2.0

/**
 * Copyright 2021-2022 weiWard LLC
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

abstract contract ETHmxRewardsData {
	address internal _ethmx;
	address internal _weth;

	uint256[] internal _arptSnapshotsDeprecated;
	mapping(address => uint256) internal _arptLastIdx;

	uint256 internal _lastAccrualUpdateDeprecated;
	uint256 internal _accrualUpdateIntervalDeprecated;

	mapping(address => uint256) internal _rewardsFor;
	uint256 internal _lastTotalRewardsAccruedDeprecated;
	uint256 internal _totalRewardsRedeemedDeprecated;

	mapping(address => uint256) internal _stakedFor;
	uint256 internal _totalStakedDeprecated;

	uint256[39] private __gap;
}
