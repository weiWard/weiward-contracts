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

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./ETHtxData.sol";
import "../ERC20/ERC20Data.sol";
import "../ERC20TxFee/ERC20TxFeeData.sol";
import "../interfaces/IERC20Metadata.sol";
import "../interfaces/IETHtx.sol";
import "../../rewards/interfaces/IFeeLogic.sol";
import "../../access/RbacFromOwnable/RbacFromOwnable.sol";

/* solhint-disable not-rely-on-time */

contract ETHtx is
	Initializable,
	ContextUpgradeable,
	RbacFromOwnable,
	PausableUpgradeable,
	ERC20Data,
	ERC20TxFeeData,
	ETHtxData,
	IERC20,
	IERC20Metadata,
	IETHtx
{
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
	bytes32 public constant REBASER_ROLE = keccak256("REBASER_ROLE");

	uint256 internal constant _SHARES_MULT = 1e18;

	/* Constructor */

	constructor(address owner_) {
		init(owner_);
	}

	/* Initializer */

	function init(address owner_) public virtual initializer {
		__Context_init_unchained();
		__Pausable_init_unchained();
		_setupRole(DEFAULT_ADMIN_ROLE, owner_);
	}

	/* External Mutators */

	function destroy() external override onlyRole(DEFAULT_ADMIN_ROLE) {
		address payable sender = _msgSender();
		emit Destroyed(sender);
		selfdestruct(sender);
	}

	function transfer(address recipient, uint256 amount)
		public
		virtual
		override
		returns (bool)
	{
		_transfer(_msgSender(), recipient, amount);
		return true;
	}

	function transferFrom(
		address sender,
		address recipient,
		uint256 amount
	) public virtual override returns (bool) {
		_transfer(sender, recipient, amount);
		_approve(
			sender,
			_msgSender(),
			_allowances[sender][_msgSender()].sub(
				amount,
				"ETHtx::transferFrom: amount exceeds allowance"
			)
		);
		return true;
	}

	function approve(address spender, uint256 amount)
		public
		virtual
		override
		returns (bool)
	{
		_approve(_msgSender(), spender, amount);
		return true;
	}

	function increaseAllowance(address spender, uint256 addedValue)
		public
		virtual
		returns (bool)
	{
		_approve(
			_msgSender(),
			spender,
			_allowances[_msgSender()][spender].add(addedValue)
		);
		return true;
	}

	function decreaseAllowance(address spender, uint256 subtractedValue)
		public
		virtual
		returns (bool)
	{
		_approve(
			_msgSender(),
			spender,
			_allowances[_msgSender()][spender].sub(
				subtractedValue,
				"ETHtx::decreaseAllowance: below zero"
			)
		);
		return true;
	}

	function burn(uint256 amount) external virtual override whenNotPaused {
		_burn(_msgSender(), amount);
	}

	function pause()
		external
		virtual
		onlyRole(DEFAULT_ADMIN_ROLE)
		whenNotPaused
	{
		_pause();
	}

	function unpause() external virtual onlyRole(DEFAULT_ADMIN_ROLE) whenPaused {
		_unpause();
	}

	/* External Views */

	function allowance(address owner, address spender)
		public
		view
		virtual
		override
		returns (uint256)
	{
		return _allowances[owner][spender];
	}

	function balanceOf(address) public view virtual override returns (uint256) {
		return 0;
	}

	function name() public view virtual override returns (string memory) {
		return "Ethereum Transaction";
	}

	function symbol() public view virtual override returns (string memory) {
		return "ETHtx";
	}

	function decimals() public view virtual override returns (uint8) {
		return 18;
	}

	function totalSupply() public view virtual override returns (uint256) {
		return 0;
	}

	/* Internal Mutators */

	function _approve(
		address owner,
		address spender,
		uint256 amount
	) internal virtual {
		require(owner != address(0), "ETHtx::_approve: from the zero address");
		require(spender != address(0), "ETHtx::_approve: to the zero address");

		_allowances[owner][spender] = amount;
		emit Approval(owner, spender, amount);
	}

	/**
	 * @dev Implements an ERC20 transfer with a fee.
	 *
	 * Emits a {Transfer} event. Emits a second {Transfer} event for the fee.
	 *
	 * Requirements:
	 *
	 * - `sender` cannot be the zero address.
	 * - `recipient` cannot be the zero address.
	 * - `sender` must have a balance of at least `amount`.
	 * - `_feeLogic` implements {IFeeLogic}
	 */
	function _transfer(
		address sender,
		address recipient,
		uint256 amount
	) internal virtual {
		require(sender != address(0), "ERC20: transfer from the zero address");
		require(recipient != address(0), "ERC20: transfer to the zero address");

		_balances[sender] = _balances[sender].sub(
			amount,
			"ERC20: transfer amount exceeds balance"
		);

		_balances[recipient] = _balances[recipient].add(amount);

		emit Transfer(sender, recipient, amount);
	}

	function _burn(address account, uint256 amount) internal {
		require(account != address(0), "ERC20: burn from the zero address");

		_balances[account] = _balances[account].sub(
			amount,
			"ERC20: burn amount exceeds balance"
		);

		_totalSupply = _totalSupply.sub(amount);

		emit Transfer(account, address(0), amount);
	}
}
