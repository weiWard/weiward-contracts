// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import { LibDiamond } from "../diamond/libraries/LibDiamond.sol";
import { IERC173 } from "../interfaces/IERC173.sol";
import { Ownable } from "./Ownable.sol";

contract OwnableFacet is Ownable, IERC173 {
	function transferOwnership(address _newOwner) external override onlyOwner {
		LibDiamond.setContractOwner(_newOwner);
	}

	function owner() external view override returns (address owner_) {
		owner_ = LibDiamond.contractOwner();
	}
}
