// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract GasPrice is Ownable {
	event GasPriceUpdate(
		address indexed author,
		uint256 oldGasPrice,
		uint256 newGasPrice
	);
	uint256 internal _gasPrice;

	function getGasPrice() public view returns (uint256) {
		return _gasPrice;
	}

	function setGasPrice(uint256 gasPrice) public onlyOwner {
		emit GasPriceUpdate(msg.sender, _gasPrice, gasPrice);
		_gasPrice = gasPrice;
	}
}
