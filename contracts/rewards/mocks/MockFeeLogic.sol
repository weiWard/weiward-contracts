// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../FeeLogic.sol";

contract MockFeeLogic is FeeLogic {
	event Notified(uint256 amount);

	constructor(
		address recipient_,
		uint128 feeRateNumerator,
		uint128 feeRateDenominator
	) FeeLogic(recipient_, feeRateNumerator, feeRateDenominator) {
		return;
	}

	function notify(uint256 amount) external override {
		emit Notified(amount);
	}
}
