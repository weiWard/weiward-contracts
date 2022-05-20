// SPDX-License-Identifier: Apache-2.0

/**
 * Copyright 2021-2022 weiWard LLC
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

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./ETHmxData.sol";
import "../ERC20/ERC20Upgradeable.sol";
import "../interfaces/IETHmx.sol";
import "../../access/OwnableUpgradeable.sol";

contract ETHmx is
	Initializable,
	ContextUpgradeable,
	OwnableUpgradeable,
	PausableUpgradeable,
	ERC20Upgradeable,
	ETHmxData,
	IETHmx
{
	using SafeERC20 for IERC20;

	/* Constructor */

	constructor(address owner_) {
		init(owner_);
	}

	/* Initializer */

	function init(address owner_) public virtual initializer {
		__Context_init_unchained();
		__Ownable_init_unchained(owner_);
		__Pausable_init_unchained();
		__ERC20_init_unchained();
	}

	/* External Mutators */

	function burn(uint256 amount) external virtual override {
		_burn(_msgSender(), amount);
	}

	function destroy() external override onlyOwner {
		address payable sender = _msgSender();
		emit Destroyed(sender);
		selfdestruct(sender);
	}

	/* Public Views */

	function balanceOf(address) public view virtual override returns (uint256) {
		return 0;
	}

	function totalSupply() public view virtual override returns (uint256) {
		return 0;
	}

	function name() public view virtual override returns (string memory) {
		return "ETHtx Minter Token";
	}

	function symbol() public view virtual override returns (string memory) {
		return "ETHmx";
	}
}
