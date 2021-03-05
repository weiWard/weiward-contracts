// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface IFeeLogic {
	/* Views */

	function exemptsAt(uint256 index) external view returns (address);

	function exemptsLength() external view returns (uint256);

	function feeRate()
		external
		view
		returns (uint128 numerator, uint128 denominator);

	function getFee(
		address sender,
		address recipient_,
		uint256 amount
	) external view returns (uint256);

	function isExempt(address account) external view returns (bool);

	function recipient() external view returns (address);

	function undoFee(
		address sender,
		address recipient_,
		uint256 amount
	) external view returns (uint256);

	/* Mutators */

	function notify(uint256 amount) external;

	function setExempt(address account, bool isExempt_) external;

	function setFeeRate(uint128 numerator, uint128 denominator) external;

	function setRecipient(address account) external;

	/* Events */

	event ExemptAdded(address indexed author, address indexed account);
	event ExemptRemoved(address indexed author, address indexed account);
	event FeeRateSet(
		address indexed author,
		uint128 numerator,
		uint128 denominator
	);
	event RecipientSet(address indexed author, address indexed account);
}
