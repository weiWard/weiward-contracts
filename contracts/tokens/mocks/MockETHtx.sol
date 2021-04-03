// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../ETHtx.sol";

contract MockETHtx is ETHtx {
	constructor(address feeLogic_, address minter_) ETHtx(feeLogic_, minter_) {
		return;
	}

	function mockMint(address account, uint256 amount) external {
		_mint(account, amount);
	}
}
