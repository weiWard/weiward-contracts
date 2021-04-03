// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../ERC20TxFee.sol";

contract MockERC20TxFee is ERC20TxFee {
	event BeforeTokenTransfer();

	constructor(
		string memory name,
		string memory symbol,
		uint8 decimals,
		address feeLogic_
	) ERC20TxFee(name, symbol, decimals, feeLogic_) {
		return;
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
