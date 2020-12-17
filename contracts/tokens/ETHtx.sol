// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

// TODO permissions
contract ETHtx is ERC20, Pausable {
	using SafeMath for uint256;
	using Address for address;

	/* solhint-disable-next-line no-empty-blocks */
	constructor() ERC20("Ethereum Transaction", "ETHtx") {}

	function mint(address account, uint256 amount) public {
		// TODO calculate based on ETH from callers
		// TODO Should only be callable externally from the frackt contract, but should also be able to mint more automatically if frackt and internal ETH balance is high enough
		_mint(account, amount);
	}

	function burn(address account, uint256 amount) public {
		_burn(account, amount);
		// TODO Apply redemption fee and transfer ETH
	}

	function transfer(address recipient, uint256 amount)
		public
		virtual
		override
		returns (bool)
	{
		// TODO Apply transfer fee on amount
		return super.transfer(recipient, amount);
	}

	function transferFrom(
		address sender,
		address recipient,
		uint256 amount
	) public virtual override returns (bool) {
		// TODO Apply transfer fee on amount. This is why we can't just override _transfer.
		return super.transferFrom(sender, recipient, amount);
	}

	function pause() public virtual whenNotPaused {
		_pause();
	}

	function unpause() public virtual whenPaused {
		_unpause();
	}
}
