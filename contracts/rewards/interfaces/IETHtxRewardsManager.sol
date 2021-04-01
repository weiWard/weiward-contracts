// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IETHtxRewardsManager {
	/* Views */

	function ethmxRewards() external view returns (address);

	function ethtx() external view returns (address);

	function ethtxAMM() external view returns (address);

	function lpRewards() external view returns (address);

	/* Mutators */

	function convertETHtx() external;

	function distributeRewards() external returns (uint256);

	function notifyRecipients() external;

	function sendRewards() external returns (uint256);

	function setEthmxRewardsAddress(address addr) external;

	function setEthtxAddress(address addr) external;

	function setEthtxAMMAddress(address addr) external;

	function setLPRewardsAddress(address addr) external;

	/* Events */

	event EthmxRewardsAddressSet(address indexed author, address indexed addr);
	event EthtxAddressSet(address indexed author, address indexed addr);
	event EthtxAMMAddressSet(address indexed author, address indexed addr);
	event LPRewardsAddressSet(address indexed author, address indexed addr);
	event RewardsSent(
		address indexed author,
		address indexed to,
		uint256 amount
	);
}
