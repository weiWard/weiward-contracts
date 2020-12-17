// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

// TODO permissions
// TODO staking and rewards
contract Frackt is ERC20, Pausable {
	using SafeMath for uint256;
	using Address for address;

	/* solhint-disable-next-line no-empty-blocks */
	constructor() ERC20("Fracking Token", "frackt") {}

	function mint(address account, uint256 amount) public {
		// TODO mint 1:1 with ETH
		_mint(account, amount);
	}

	function pause() public virtual whenNotPaused {
		_pause();
	}

	function unpause() public virtual whenPaused {
		_unpause();
	}
}
