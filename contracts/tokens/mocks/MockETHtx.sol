// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../ETHtx.sol";

contract MockETHtx is ETHtx {
	constructor(
		address feeLogic_,
		address gasOracle_,
		address minter_,
		address wethAddr_,
		uint128 targetCRatioNumerator,
		uint128 targetCRatioDenominator
	)
		ETHtx(
			feeLogic_,
			gasOracle_,
			minter_,
			wethAddr_,
			targetCRatioNumerator,
			targetCRatioDenominator
		)
	{
		return;
	}

	function mockMint(address account, uint256 amount) external {
		_mint(account, amount);
	}
}
