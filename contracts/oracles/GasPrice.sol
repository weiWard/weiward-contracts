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

	constructor() {
		_setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
	}

	function setValue(uint256 _gasPrice) public {
		require(
			hasRole(ORACLE_ROLE, msg.sender),
			"Caller is not a trusted oracle source."
		);
		emit GasPriceUpdate(msg.sender, gasPrice, _gasPrice);
		gasPrice = _gasPrice;
	}
}
