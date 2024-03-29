// SPDX-License-Identifier: Apache-2.0

/**
 * Copyright 2021 weiWard LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

pragma solidity 0.7.6;
pragma abicoder v2;

import "../ETHtxv1/ETHtxv1.sol";

contract MockETHtxv1 is ETHtxv1 {
	using SafeMath for uint256;

	constructor(address owner_) ETHtxv1(owner_) {
		return;
	}

	function mockMint(address account, uint256 amount) external {
		_mint(account, amount);
	}

	function mockMintShares(address account, uint256 amount) external {
		uint256 ts = _totalShares.add(amount);
		_totalShares = ts;
		_sharesPerToken = ts.mul(_SHARES_MULT).div(_totalSupply);
		_balances[account] = _balances[account].add(amount);
	}

	function mockBurn(address account, uint256 amount) external {
		_burn(account, amount);
	}

	function mockBurnShares(address account, uint256 amount) external {
		_balances[account] = _balances[account].sub(amount);
		uint256 ts = _totalShares.sub(amount);
		_totalShares = ts;
		_sharesPerToken = ts.mul(_SHARES_MULT).div(_totalSupply);
	}
}
