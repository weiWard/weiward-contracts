// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import { IContextFacet } from "./IContextFacet.sol";

contract Context {
	function _msgSender() internal view returns (address payable) {
		return IContextFacet(address(this)).msgSender();
	}

	function _msgData() internal view returns (bytes memory) {
		return IContextFacet(address(this)).msgData();

		// TODO use assembly but maintain context and function visibility
		// Gas-efficient call to ContextFacet
		// LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
		// bytes4 selector = bytes4(keccak256("msgData()"));
		// address facet = address(bytes20(ds.facets[selector]));
		// bytes memory fn = abi.encodeWithSelector(selector);
		// // solhint-disable-next-line avoid-low-level-calls
		// (bool success, bytes memory result) = facet.delegatecall(fn);
		// require(success, "Context: msgData failed");
		// return abi.decode(result, (bytes));
	}
}
