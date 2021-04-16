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

import "./interfaces/IValuePerToken.sol";

interface IMooniswap {
	function totalSupply() external view returns (uint256);

	function getTokens() external view returns (address[] memory);
}

contract ValuePerMoonV1 is IValuePerToken {
	/* Immutable Public State */

	address public immutable override token;
	address public immutable valueToken;

	/* Constructor */

	constructor(address _token, address _valueToken) {
		bool hasToken = false;
		address[] memory tokens = IMooniswap(_token).getTokens();
		for (uint256 i = 0; i < tokens.length; i++) {
			if (_valueToken == tokens[i]) {
				hasToken = true;
				break;
			}
		}
		require(hasToken, "ValuePerMoonV1: pool lacks token");

		token = _token;
		valueToken = _valueToken;
	}

	/* External Views */

	function valuePerToken()
		external
		view
		override
		returns (uint256 numerator, uint256 denominator)
	{
		denominator = IMooniswap(token).totalSupply();

		address[] memory tokens = IMooniswap(token).getTokens();
		for (uint256 i = 0; i < tokens.length; i++) {
			address pairToken = tokens[i];
			if (valueToken != pairToken) {
				continue;
			}
			numerator = IERC20(pairToken).balanceOf(token);
			break;
		}
	}
}
