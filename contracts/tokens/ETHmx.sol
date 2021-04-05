// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./ERC20/ERC20Upgradeable.sol";
import "./interfaces/IETHmx.sol";

contract ETHmx is
	Initializable,
	ContextUpgradeable,
	OwnableUpgradeable,
	PausableUpgradeable,
	ERC20Upgradeable,
	IETHmx
{
	using SafeERC20 for IERC20;

	/* Mutable Internal State */

	address internal _minter;

	/* Constructor */

	constructor(address owner_, address minter_) {
		init(owner_, minter_);
	}

	/* Initializer */

	function init(address owner_, address minter_) public virtual initializer {
		__Context_init_unchained();
		__Ownable_init_unchained();
		__Pausable_init_unchained();
		__ERC20_init_unchained();

		setMinter(minter_);

		if (owner_ != owner()) {
			transferOwnership(owner_);
		}
	}

	/* Modifiers */

	modifier onlyMinter {
		require(_msgSender() == minter(), "ETHmx: caller is not the minter");
		_;
	}

	/* External Mutators */

	function burn(uint256 amount) external virtual override {
		_burn(_msgSender(), amount);
	}

	function mintTo(address account, uint256 amount)
		external
		virtual
		override
		onlyMinter
		whenNotPaused
	{
		_mint(account, amount);
	}

	function pause() external virtual override onlyOwner {
		_pause();
	}

	function recoverERC20(
		address token,
		address to,
		uint256 amount
	) external virtual override onlyOwner {
		IERC20(token).safeTransfer(to, amount);
		emit Recovered(_msgSender(), token, to, amount);
	}

	function setMinter(address account) public virtual override onlyOwner {
		_minter = account;
		emit MinterSet(_msgSender(), account);
	}

	function unpause() external virtual override onlyOwner {
		_unpause();
	}

	/* Public Views */

	function minter() public view virtual override returns (address) {
		return _minter;
	}

	function name() public view virtual override returns (string memory) {
		return "ETHtx Minter Token";
	}

	function symbol() public view virtual override returns (string memory) {
		return "ETHmx";
	}
}
