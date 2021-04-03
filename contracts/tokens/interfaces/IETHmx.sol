// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IETHmx {
	/* Views */

	function minter() external view returns (address);

	/* Mutators */

	function burn(uint256 amount) external;

	function mintTo(address account, uint256 amount) external;

	function pause() external;

	function recoverERC20(
		address token,
		address to,
		uint256 amount
	) external;

	function setMinter(address account) external;

	function unpause() external;

	/* Events */

	event MinterSet(address indexed author, address indexed account);
	event Recovered(
		address indexed author,
		address indexed token,
		address indexed to,
		uint256 amount
	);
}
