// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./ERC20TxFee/ERC20TxFeeUpgradeable.sol";
import "./interfaces/IETHtx.sol";

contract ETHtx is
	Initializable,
	ContextUpgradeable,
	OwnableUpgradeable,
	PausableUpgradeable,
	ERC20TxFeeUpgradeable,
	IETHtx
{
	using SafeERC20 for IERC20;

	/* Mutable Internal State */

	address internal _minter;

	/* Constructor */

	constructor(
		address owner_,
		address feeLogic_,
		address minter_
	) {
		init(owner_, feeLogic_, minter_);
	}

	/* Initializer */

	function init(
		address owner_,
		address feeLogic_,
		address minter_
	) public virtual initializer {
		__Context_init_unchained();
		__Ownable_init_unchained();
		__Pausable_init_unchained();
		__ERC20TxFee_init_unchained(feeLogic_);

		setMinter(minter_);
		// Add in update
		// emit FeeLogicSet(_msgSender(), feeLogic_);

		if (owner_ != owner()) {
			transferOwnership(owner_);
		}
	}

	/* Modifiers */

	modifier onlyMinter {
		require(_msgSender() == minter(), "ETHtx: caller is not the minter");
		_;
	}

	/* External Views */

	function minter() public view virtual override returns (address) {
		return _minter;
	}

	function name() public view virtual override returns (string memory) {
		return "Ethereum Transaction";
	}

	function symbol() public view virtual override returns (string memory) {
		return "ETHtx";
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

	function recoverERC20(
		address token,
		address to,
		uint256 amount
	) external virtual override onlyOwner {
		IERC20(token).safeTransfer(to, amount);
		emit Recovered(_msgSender(), token, to, amount);
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
