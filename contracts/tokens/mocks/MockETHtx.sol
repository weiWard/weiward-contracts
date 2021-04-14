// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "../ETHtx/ETHtx.sol";

contract MockETHtx is ETHtx {
	constructor(address owner_) ETHtx(owner_) {
		return;
	}

	function mockMint(address account, uint256 amount) external {
		_mint(account, amount);
	}
}
