// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

library LibETHtxAMM {
	bytes32 public constant ETHTXAMM_STORAGE_POSITION =
		keccak256("org.weiWard.ETHtxAMM.storage");

	struct ETHtxAMMStorage {
		address ethtx;
		address gasOracle;
		uint128 targetCRatioNum;
		uint128 targetCRatioDen;
		address weth;
	}

	function ethtxAMMStorage()
		internal
		pure
		returns (ETHtxAMMStorage storage s)
	{
		bytes32 position = ETHTXAMM_STORAGE_POSITION;
		// solhint-disable-next-line no-inline-assembly
		assembly {
			s.slot := position
		}
	}
}
