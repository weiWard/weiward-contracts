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
pragma abicoder v2;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./ETHtxAMMData.sol";
import "../interfaces/IETHtxAMM.sol";
import "../../tokens/interfaces/IETHmx.sol";
import "../../tokens/interfaces/IETHtx.sol";
import "../../tokens/interfaces/IERC20TxFee.sol";
import "../../tokens/interfaces/IWETH.sol";
import "../../rewards/interfaces/IFeeLogic.sol";
import "../../oracles/interfaces/IGasPrice.sol";
import "../../access/OwnableUpgradeable.sol";

contract ETHtxAMM is
	Initializable,
	ContextUpgradeable,
	OwnableUpgradeable,
	PausableUpgradeable,
	ETHtxAMMData,
	IETHtxAMM
{
	using Address for address payable;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	struct ETHtxAMMArgs {
		address weth;
		address ethmx;
	}

	/* Constructor */

	constructor(address owner_) {
		init(owner_);
	}

	/* Initializer */

	function init(address owner_) public virtual initializer {
		__Context_init_unchained();
		__Ownable_init_unchained(owner_);
		__Pausable_init_unchained();
	}

	function postInit(ETHtxAMMArgs memory _args) external virtual onlyOwner {
		_weth = _args.weth;
		_ethmx = _args.ethmx;
	}

	function postUpgrade(address secureVault) external virtual onlyOwner {
		// Deprecate contract and move funds to vault.
		IERC20 wethHandle = IERC20(_weth);
		uint256 ethSupply = wethHandle.balanceOf(address(this));
		wethHandle.safeTransfer(secureVault, ethSupply);
	}

	function destroy() external override onlyOwner {
		address payable sender = _msgSender();
		emit Destroyed(sender);
		selfdestruct(sender);
	}
}
