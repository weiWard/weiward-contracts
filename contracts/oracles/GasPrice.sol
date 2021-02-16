// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract GasPrice is AccessControl {
	event GasPriceUpdate(
		address indexed author,
		uint256 oldValue,
		uint256 newValue
	);
	bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
	uint256 public gasPrice;
	uint256 public updateThreshold;
	uint256 public updatedAt;

	constructor(uint256 _updateThreshold, uint256 _gasPrice) {
		_setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
		updateThreshold = _updateThreshold;
		gasPrice = _gasPrice;
	}

	function setGasPrice(uint256 _gasPrice) public {
		require(
			hasRole(ORACLE_ROLE, msg.sender),
			"Caller is not a trusted oracle source."
		);
		require(hasPriceExpired(), "The current gas price has not expired.");

		// update public values
		updatedAt = block.timestamp;
		gasPrice = _gasPrice;
		emit GasPriceUpdate(msg.sender, gasPrice, _gasPrice);
	}

	function setUpdateThreshold(uint256 _updateThreshold) public {
		require(
			hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
			"Caller is not the contract admin."
		);
		updateThreshold = _updateThreshold;
	}

	function hasPriceExpired() public returns (bool) {
		return (updatedAt - block.timestamp) > updateThreshold;
	}
}
