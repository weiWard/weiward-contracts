// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../ETHtx.sol";

contract MockETHtx is ETHtx {
	constructor(
		address owner_,
		address feeLogic_,
		address minter_
	) ETHtx(owner_, feeLogic_, minter_) {
		return;
	}

	function mockMint(address account, uint256 amount) external {
		_mint(account, amount);
	}
}
