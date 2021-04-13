// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;

import "@sushiswap/core/contracts/uniswapv2/UniswapV2Router02.sol";

contract MockSushiV2Router02 is UniswapV2Router02 {
	constructor(address _factory, address _weth)
		public
		UniswapV2Router02(_factory, _weth)
	{
		return;
	}
}
