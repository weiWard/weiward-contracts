// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract SimpleGasPrice {
	uint256 public gasPrice;

	constructor(uint256 gasPrice_) {
		gasPrice = gasPrice_;
	}

	function setGasPrice(uint256 value) external {
		gasPrice = value;
	}
}
