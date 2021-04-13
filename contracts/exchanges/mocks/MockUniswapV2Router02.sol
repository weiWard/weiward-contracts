// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@uniswap/v2-periphery/contracts/UniswapV2Router02.sol";

contract MockUniswapV2Router02 is UniswapV2Router02 {
	constructor(address _factory, address _weth)
		public
		UniswapV2Router02(_factory, _weth)
	{
		return;
	}
}
