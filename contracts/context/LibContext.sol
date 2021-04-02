// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import { LibDiamond } from "../diamond/libraries/LibDiamond.sol";

library LibContext {
	bytes32 public constant CONTEXT_STORAGE_POSITION =
		keccak256("org.weiWard.context.storage");

	struct ContextStorage {
		address trustedForwarder;
	}

	function contextStorage() internal pure returns (ContextStorage storage s) {
		bytes32 position = CONTEXT_STORAGE_POSITION;
		// solhint-disable-next-line no-inline-assembly
		assembly {
			s.slot := position
		}
	}
}
