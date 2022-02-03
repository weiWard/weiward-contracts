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
		// Can only be called once
		require(
			_targetCRatioDenDeprecated != 0,
			"ETHtxAMM::postUpgrade: already executed"
		);

		// Move platform funds to vault.
		IERC20 wethHandle = IERC20(_weth);
		uint256 ethSupply = wethHandle.balanceOf(address(this));
		// Calculate platform ETH after accounting for past withdrawals.
		uint256 platformEth = ethSupply.sub(_gethDeprecated).mul(4).div(10);
		platformEth += _gethDeprecated;
		// Move to vault.
		wethHandle.safeTransfer(secureVault, platformEth);

		// Clear deprecated state
		_gasOracleDeprecated = address(0);
		_targetCRatioNumDeprecated = 0;
		_targetCRatioDenDeprecated = 0;
		_ethtxDeprecated = address(0);
		_gethDeprecated = 0;
	}

	/* Fallbacks */

	receive() external payable {
		// Only accept ETH via fallback from the WETH contract
		address weth_ = weth();
		if (msg.sender != weth_) {
			// Otherwise try to convert it to WETH
			IWETH(weth_).deposit{ value: msg.value }();
		}
	}

	/* External Mutators */

	function burnETHmx(uint256 amount, bool asWETH)
		external
		virtual
		override
		whenNotPaused
	{
		address account = _msgSender();
		uint256 ethmxSupply = IERC20(ethmx()).totalSupply();
		require(ethmxSupply != 0, "ETHtxAMM: no ETHmx supply");
		require(amount != 0, "ETHtxAMM: zero amount");

		IERC20 wethHandle = IERC20(weth());

		// Calculate proportional ETH due
		uint256 ethSupply = wethHandle.balanceOf(address(this));
		uint256 amountETH = ethSupply.mul(amount).div(ethmxSupply);

		// Burn ETHmx (ETHmx doesn't have a burnFrom function)
		IERC20(ethmx()).transferFrom(account, address(this), amount);
		IETHmx(ethmx()).burn(amount);

		// Send ETH
		if (asWETH) {
			wethHandle.safeTransfer(account, amountETH);
		} else {
			IWETH(weth()).withdraw(amountETH);
			payable(account).sendValue(amountETH);
		}

		emit BurnedETHmx(account, amount);
	}

	function pause() external virtual override onlyOwner whenNotPaused {
		_pause();
	}

	function recoverUnsupportedERC20(
		address token,
		address to,
		uint256 amount
	) external virtual override onlyOwner {
		require(token != weth(), "ETHtxAMM: cannot recover WETH");

		IERC20(token).safeTransfer(to, amount);
		emit RecoveredUnsupported(_msgSender(), token, to, amount);
	}

	function unpause() external virtual override onlyOwner whenPaused {
		_unpause();
	}

	/* Public Views */

	function ethmx() public view virtual override returns (address) {
		return _ethmx;
	}

	function weth() public view virtual override returns (address) {
		return _weth;
	}
}
