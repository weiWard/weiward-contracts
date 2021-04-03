// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import { Diamond } from "../../diamond/Diamond.sol";
import { IDiamondCut } from "../../diamond/interfaces/IDiamondCut.sol";
import { LibETHtxAMM } from "./LibETHtxAMM.sol";
import { IWETH } from "../../tokens/interfaces/IWETH.sol";

contract ETHtxAMMDiamond is Diamond {
	constructor(
		IDiamondCut.FacetCut[] memory _diamondCut,
		Diamond.DiamondArgs memory _args
	) Diamond(_diamondCut, _args) {
		return;
	}

	receive() external payable {
		// Only accept random ETH if we can convert it to WETH
		LibETHtxAMM.ETHtxAMMStorage storage es = LibETHtxAMM.ethtxAMMStorage();
		IWETH(es.weth).deposit{ value: msg.value }();
	}
}
