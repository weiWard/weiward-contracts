// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../ERC20TxFee.sol";

contract MockERC20TxFee is ERC20TxFee {
	string private _name;
	string private _symbol;
	uint8 private immutable _decimals;

	event BeforeTokenTransfer();

	constructor(
		string memory name_,
		string memory symbol_,
		uint8 decimals_,
		address feeLogic_
	) ERC20TxFee(feeLogic_) {
		_name = name_;
		_symbol = symbol_;
		_decimals = decimals_;
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

	function _beforeTokenTransfer(
		address, /* from */
		address, /* to */
		uint256 /* amount */
	) internal override {
		emit BeforeTokenTransfer();
	}
}
