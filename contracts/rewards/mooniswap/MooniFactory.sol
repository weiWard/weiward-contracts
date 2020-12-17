// SPDX-License-Identifier: MIT

/**
 * From https://github.com/1inch-exchange/mooniswap/blob/v1.0/contracts/MooniFactory.sol
 * This is used exclusively for testing.
 * Changes:
 * - Updated from solidity ^0.6.0 to ^0.7.0.
 * - Reformatted styling in line with this repository.
 */

/*
MIT License

Copyright (c) 2020 Mooniswap

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./UniERC20.sol";
import "./Mooniswap.sol";

contract MooniFactory is Ownable {
	using UniERC20 for IERC20;

	event Deployed(
		address indexed mooniswap,
		address indexed token1,
		address indexed token2
	);

	uint256 public constant MAX_FEE = 0.003e18; // 0.3%

	uint256 public fee;
	Mooniswap[] public allPools;
	mapping(Mooniswap => bool) public isPool;
	mapping(IERC20 => mapping(IERC20 => Mooniswap)) public pools;

	function getAllPools() external view returns (Mooniswap[] memory) {
		return allPools;
	}

	function setFee(uint256 newFee) external onlyOwner {
		require(newFee <= MAX_FEE, "Factory: fee should be <= 0.3%");
		fee = newFee;
	}

	function deploy(IERC20 tokenA, IERC20 tokenB)
		public
		returns (Mooniswap pool)
	{
		require(tokenA != tokenB, "Factory: not support same tokens");
		require(
			pools[tokenA][tokenB] == Mooniswap(0),
			"Factory: pool already exists"
		);

		(IERC20 token1, IERC20 token2) = sortTokens(tokenA, tokenB);
		IERC20[] memory tokens = new IERC20[](2);
		tokens[0] = token1;
		tokens[1] = token2;

		string memory symbol1 = token1.uniSymbol();
		string memory symbol2 = token2.uniSymbol();

		pool = new Mooniswap(
			tokens,
			string(abi.encodePacked("Mooniswap V1 (", symbol1, "-", symbol2, ")")),
			string(abi.encodePacked("MOON-V1-", symbol1, "-", symbol2))
		);

		pool.transferOwnership(owner());
		pools[token1][token2] = pool;
		pools[token2][token1] = pool;
		allPools.push(pool);
		isPool[pool] = true;

		emit Deployed(address(pool), address(token1), address(token2));
	}

	function sortTokens(IERC20 tokenA, IERC20 tokenB)
		public
		pure
		returns (IERC20, IERC20)
	{
		if (tokenA < tokenB) {
			return (tokenA, tokenB);
		}
		return (tokenB, tokenA);
	}
}
