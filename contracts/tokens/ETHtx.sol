// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./ERC20TxFee.sol";
import "./interfaces/IETHtx.sol";
import "./interfaces/IWETH.sol";
import "../oracles/interfaces/IGasPrice.sol";

contract ETHtx is Ownable, Pausable, ERC20TxFee, IETHtx {
	using Address for address payable;
	using SafeERC20 for IERC20;
	using SafeMath for uint128;
	using SafeMath for uint256;

	/* Mutable Internal State */
	address internal _minter;

	/* Constructor */

	constructor(address feeLogic_, address minter_)
		Ownable()
		ERC20TxFee("Ethereum Transaction", "ETHtx", 18, feeLogic_)
	{
		setMinter(minter_);
	}

	/* Modifiers */

	modifier onlyMinter {
		require(_msgSender() == minter(), "ETHtx: caller is not the minter");
		_;
	}

	/* External Views */

	function minter() public view override returns (address) {
		return _minter;
	}

	/* External Mutators */

	function burn(address account, uint256 amount)
		external
		virtual
		override
		onlyMinter
		whenNotPaused
	{
		_burn(account, amount);
	}

	function mint(address account, uint256 amount)
		external
		virtual
		override
		onlyMinter
		whenNotPaused
	{
		_mint(account, amount);
	}

	function pause() external virtual override onlyOwner whenNotPaused {
		_pause();
	}

	function unpause() external virtual override onlyOwner whenPaused {
		_unpause();
	}

	/* Public Mutators */

	function setFeeLogic(address account) public virtual override onlyOwner {
		require(account != address(0), "ETHtx: feeLogic zero address");
		_feeLogic = account;
		emit FeeLogicSet(_msgSender(), account);
	}

	function setMinter(address account) public virtual override onlyOwner {
		_minter = account;
		emit MinterSet(_msgSender(), account);
	}
}
