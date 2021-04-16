// SPDX-License-Identifier: Apache-2.0

/**
 * Copyright 2021 weiWard LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
