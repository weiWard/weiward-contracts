// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface IETHtxRewardsManager {
	/* Views */

	function ethmxRewardsAddr() external view returns (address);

	function ethtxAddr() external view returns (address);

	function lpRewardsAddr() external view returns (address);

	/* Mutators */

	function convertETHtx() external;

	function distributeRewards() external returns (uint256);

	function notifyRecipients() external;

	function sendRewards() external returns (uint256);

	function setEthmxRewardsAddress(address addr) external;

	function setEthtxAddress(address addr) external;

	function setLPRewardsAddress(address addr) external;

	/* Events */

	event EthmxRewardsAddressSet(address indexed author, address indexed addr);
	event EthtxAddressSet(address indexed author, address indexed addr);
	event LPRewardsAddressSet(address indexed author, address indexed addr);
	event RewardsSent(
		address indexed author,
		address indexed to,
		uint256 amount
	);
}
