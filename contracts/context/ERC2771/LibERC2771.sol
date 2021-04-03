// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

struct ERC2771Storage {
	address trustedForwarder;
}

library LibERC2771 {
	bytes32 internal constant _ERC2771_STORAGE_POSITION =
		keccak256("org.weiWard.ERC2771.storage");

	function erc2771Storage() internal pure returns (ERC2771Storage storage s) {
		bytes32 position = _ERC2771_STORAGE_POSITION;
		// solhint-disable-next-line no-inline-assembly
		assembly {
			s.slot := position
		}
	}
}
