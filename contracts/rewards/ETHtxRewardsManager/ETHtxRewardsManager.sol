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
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./ETHtxRewardsManagerData.sol";
import "../interfaces/IETHtxRewardsManager.sol";
import "../../access/OwnableUpgradeable.sol";
import "../RewardsManager/RewardsManagerData.sol";

contract ETHtxRewardsManager is
	Initializable,
	ContextUpgradeable,
	OwnableUpgradeable,
	RewardsManagerData,
	ETHtxRewardsManagerData,
	IETHtxRewardsManager
{
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	/* Constructor */

	constructor(address owner_) {
		init(owner_);
	}

	/* Initializer */

	function init(address owner_) public virtual initializer {
		__Context_init_unchained();
		__Ownable_init_unchained(owner_);
	}

	function postInit(address rewardsToken) external virtual onlyOwner {
		_rewardsToken = rewardsToken;
	}

	function postUpgrade(address secureVault) external virtual onlyOwner {
		// Deprecate contract and move funds to vault.
		IERC20 rewardsHandle = IERC20(_rewardsToken);
		uint256 rewardsSupply = rewardsHandle.balanceOf(address(this));
		rewardsHandle.safeTransfer(secureVault, rewardsSupply);

		// Clear deprecated state
		_ethmxRewards = address(0);
		_ethtx = address(0);
		_ethtxAMM = address(0);
		_lpRewards = address(0);
		_defaultRecipient = address(0);
		_totalRewardsRedeemed = 0;
	}

	function destroy() external override onlyOwner {
		address payable sender = _msgSender();
		emit Destroyed(sender);
		selfdestruct(sender);
	}
}
