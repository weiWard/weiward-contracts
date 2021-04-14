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

	function setEthmxRewards(address account) external;

	function setEthtx(address account) external;

	function setEthtxAMM(address account) external;

	function setLPRewards(address account) external;

	/* Events */

	event EthmxRewardsSet(address indexed author, address indexed account);
	event EthtxSet(address indexed author, address indexed account);
	event EthtxAMMSet(address indexed author, address indexed account);
	event LPRewardsSet(address indexed author, address indexed account);
	event RewardsSent(
		address indexed author,
		address indexed to,
		uint256 amount
	);
}
