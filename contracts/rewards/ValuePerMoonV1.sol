// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

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
