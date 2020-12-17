// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface IValuePerToken {
	/* Views */

	function token() external view returns (address);

	function valuePerToken()
		external
		view
		returns (uint256 numerator, uint256 denominator);
}
