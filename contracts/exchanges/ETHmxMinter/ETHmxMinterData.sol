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

import "@openzeppelin/contracts/utils/EnumerableSet.sol";

import "../interfaces/IETHmxMinter.sol";

abstract contract ETHmxMinterData {
	address internal _ethmx;
	address internal _ethtx;
	address internal _ethtxAMM;
	address internal _weth;

	// ETHmx minting
	uint256 internal _totalGiven;
	IETHmxMinter.ETHmxMintParams internal _ethmxMintParams;

	// ETHtx minting
	// TODO Remove mintGasPrice
	uint256 internal _mintGasPrice;
	uint128 internal _minGasPrice;
	uint64 internal _minGasPriceMultNum;
	uint64 internal _minGasPriceMultDen;

	// Liquidity pool distribution
	uint128 internal _lpShareNum;
	uint128 internal _lpShareDen;
	EnumerableSet.AddressSet internal _lps;
	address internal _lpRecipient;

	uint256[40] private __gap;
}
