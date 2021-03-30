// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./ERC20.sol";
import "./interfaces/IETHmx.sol";

contract ETHmx is Ownable, Pausable, ERC20, IETHmx {
	using SafeERC20 for IERC20;

	/* Mutable Internal State */

	address internal _minter;

	/* Constructor */

	constructor(address minter_)
		Ownable()
		ERC20("ETHtx Minter Token", "ETHmx", 18)
	{
		setMinter(minter_);
	}

	/* Modifiers */

	modifier onlyMinter {
		require(_msgSender() == minter(), "ETHmx: caller is not the minter");
		_;
	}

	/* External Mutators */

	function burn(uint256 amount) external override {
		_burn(_msgSender(), amount);
	}

	function mintTo(address account, uint256 amount)
		external
		override
		onlyMinter
		whenNotPaused
	{
		_mint(account, amount);
	}

	function pause() external override onlyOwner {
		_pause();
	}

	function recoverERC20(
		address token,
		address to,
		uint256 amount
	) external override onlyOwner {
		IERC20(token).safeTransfer(to, amount);
		emit Recovered(_msgSender(), token, to, amount);
	}

	function setMinter(address account) public override onlyOwner {
		_minter = account;
		emit MinterSet(_msgSender(), account);
	}

	function unpause() external override onlyOwner {
		_unpause();
	}

	/* Public Views */

	function minter() public view override returns (address) {
		return _minter;
	}
}
