// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IRewardsManager {
	/* Views */

	function defaultRecipient() external view returns (address);

	function rewardsToken() external view returns (address);

	function sharesFor(address account)
		external
		view
		returns (uint128 active, uint128 total);

	function totalRewardsAccrued() external view returns (uint256);

	function totalRewardsRedeemed() external view returns (uint256);

	function totalShares() external view returns (uint256);

	/* Mutators */

	function activateShares() external;

	function activateSharesFor(address account) external;

	function addShares(address account, uint128 amount) external;

	function deactivateShares() external;

	function deactivateSharesFor(address account) external;

	function recoverUnsupportedERC20(
		address token,
		address to,
		uint256 amount
	) external;

	function removeShares(address account, uint128 amount) external;

	function setDefaultRecipient(address account) external;

	function setRewardsToken(address token) external;

	function setShares(
		address account,
		uint128 value,
		bool isActive
	) external;

	/* Events */

	event DefaultRecipientSet(address indexed author, address indexed account);
	event RecoveredUnsupported(
		address indexed author,
		address indexed token,
		address indexed to,
		uint256 amount
	);
	event RewardsTokenSet(address indexed author, address indexed token);
	event SharesActivated(address indexed author, address indexed account);
	event SharesAdded(
		address indexed author,
		address indexed account,
		uint128 amount
	);
	event SharesDeactivated(address indexed author, address indexed account);
	event SharesRemoved(
		address indexed author,
		address indexed account,
		uint128 amount
	);
	event SharesSet(
		address indexed author,
		address indexed account,
		uint128 value,
		bool isActive
	);
}
