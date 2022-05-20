// SPDX-License-Identifier: Apache-2.0

/**
 * Copyright 2021-2022 weiWard LLC
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

interface IETHmxMinter {
	/* Types */

	struct ETHmxMintParams {
		// Uses a single 32 byte slot and avoids stack too deep errors
		uint32 cCapNum;
		uint32 cCapDen;
		uint32 zetaFloorNum;
		uint32 zetaFloorDen;
		uint32 zetaCeilNum;
		uint32 zetaCeilDen;
	}

	/* Mutators */

	function destroy() external;

	/* Events */

	event Destroyed(address indexed author);
}
