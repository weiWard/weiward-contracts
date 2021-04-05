// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../GasPrice.sol";

contract MockGasPrice is GasPrice {
	constructor(
		address admin,
		uint256 _updateThreshold,
		uint256 _gasPrice
	) GasPrice(admin, _updateThreshold, _gasPrice) {
		return;
	}

	function setUpdatedAt(uint256 value) external {
		updatedAt = value;
	}
}
