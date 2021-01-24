// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract GasPrice is Ownable {
	event GasPriceUpdate(
		address indexed author,
		uint256 oldValue,
		uint256 newValue
	);
	uint256 internal _gasPrice;

	function getValue() public view returns (uint256) {
		return _gasPrice;
	}

	function setValue(uint256 gasPrice) public onlyOwner {
		emit GasPriceUpdate(msg.sender, _gasPrice, gasPrice);
		_gasPrice = gasPrice;
	}
}
