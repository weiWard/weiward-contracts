// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../GasPrice.sol";

contract MockGasPrice is GasPrice {
	constructor(uint256 _updateThreshold, uint256 _gasPrice)
		GasPrice(_updateThreshold, _gasPrice)
	{
		return;
	}

	function setUpdatedAt(uint256 value) external {
		updatedAt = value;
	}
}
