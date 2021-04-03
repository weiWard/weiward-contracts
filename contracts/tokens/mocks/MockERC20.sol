// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../ERC20.sol";

contract MockERC20 is ERC20 {
	constructor(
		string memory name,
		string memory symbol,
		uint8 decimals,
		uint256 supply
	) ERC20(name, symbol, decimals) {
		_mint(msg.sender, supply);
	}

	function mint(address account, uint256 amount) public {
		_mint(account, amount);
	}
}
