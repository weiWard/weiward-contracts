// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "../FeeLogic.sol";

contract MockFeeLogic is FeeLogic {
	event Notified(uint256 amount);

	constructor(
		address owner_,
		address recipient_,
		uint128 feeRateNumerator,
		uint128 feeRateDenominator,
		ExemptData[] memory exemptions
	)
		FeeLogic(
			owner_,
			recipient_,
			feeRateNumerator,
			feeRateDenominator,
			exemptions
		)
	{
		return;
	}

	function notify(uint256 amount) external override {
		emit Notified(amount);
	}
}
