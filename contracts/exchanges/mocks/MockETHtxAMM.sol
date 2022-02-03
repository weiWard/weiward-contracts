// SPDX-License-Identifier: Apache-2.0

/**
 * Copyright 2022 weiWard LLC
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
pragma abicoder v2;

import "../ETHtxAMM/ETHtxAMM.sol";

contract MockETHtxAMM is ETHtxAMM {
	constructor(address owner_) ETHtxAMM(owner_) {
		return;
	}

	function gasOracledDeprecated() external view returns (address) {
		return _gasOracleDeprecated;
	}

	function targetCRatioNumDeprecated() external view returns (uint128) {
		return _targetCRatioNumDeprecated;
	}

	function targetCRatioDenDeprecated() external view returns (uint128) {
		return _targetCRatioDenDeprecated;
	}

	function ethtxDeprecated() external view returns (address) {
		return _ethtxDeprecated;
	}

	function gethDeprecated() external view returns (uint256) {
		return _gethDeprecated;
	}
}
