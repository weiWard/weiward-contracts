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

import "../ERC20TxFee/ERC20TxFee.sol";

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
