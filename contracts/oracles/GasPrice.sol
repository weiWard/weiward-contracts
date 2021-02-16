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
	uint256 public lastUpdateTimestamp;

	constructor(uint256 _updateThreshold) {
		_setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
		updateThreshold = _updateThreshold;
	}

	function setGasPrice(uint256 _gasPrice) public {
		require(
			hasRole(ORACLE_ROLE, msg.sender),
			"Caller is not a trusted oracle source."
		);
		require(lastUpdateTimestamp - block.timestamp > updateThreshold);

		// update public values
		lastUpdateTimestamp = block.timestamp;
		gasPrice = _gasPrice;
		emit GasPriceUpdate(msg.sender, gasPrice, _gasPrice);
	}

	function setUpdateThreshold(uint256 _updateThreshold) public {
		require(
			hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
			"Caller is not a trusted oracle source."
		);
		updateThreshold = _updateThreshold;
	}
}
