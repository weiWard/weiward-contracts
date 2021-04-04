// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../ERC20.sol";

contract MockERC20 is ERC20 {
	string private _name;
	string private _symbol;
	uint8 private immutable _decimals;

	constructor(
		string memory name_,
		string memory symbol_,
		uint8 decimals_,
		uint256 supply
	) {
		_name = name_;
		_symbol = symbol_;
		_decimals = decimals_;
		_mint(msg.sender, supply);
	}

	function name() public view virtual override returns (string memory) {
		return _name;
	}

	function symbol() public view virtual override returns (string memory) {
		return _symbol;
	}

	function decimals() public view virtual override returns (uint8) {
		return _decimals;
	}

	function mint(address account, uint256 amount) public {
		_mint(account, amount);
	}
}
