// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
	constructor(
		string memory name,
		string memory symbol,
		uint8 decimals,
		uint256 supply
	) ERC20(name, symbol) {
		_mint(msg.sender, supply);
		_setupDecimals(decimals);
	}

	function mint(address account, uint256 amount) public {
		_mint(account, amount);
	}
}
