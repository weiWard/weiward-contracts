// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface IETHtx {
	/* Views */

	function minter() external view returns (address);

	/* Mutators */

	function burn(address account, uint256 amount) external;

	function mint(address account, uint256 amount) external;

	function pause() external;

	function setFeeLogic(address account) external;

	function setMinter(address account) external;

	function unpause() external;

	/* Events */

	event FeeLogicSet(address indexed author, address indexed account);
	event MinterSet(address indexed author, address indexed account);
}
