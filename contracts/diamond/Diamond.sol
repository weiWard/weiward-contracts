// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

/**
 * EIP-2535 Diamond Standard: https://eips.ethereum.org/EIPS/eip-2535
 * Based on https://github.com/mudgen/diamond-2/blob/86148391a6b8f2645a28ea45b3d38441b5a76c78/contracts/Diamond.sol
 *
 * Changes:
 * - Reformatted styling in line with this repository.
 */

import "./libraries/LibDiamond.sol";
import "./interfaces/IDiamondLoupe.sol";
import "./interfaces/IDiamondCut.sol";
import "../interfaces/IERC173.sol";
import "../interfaces/IERC165.sol";

contract Diamond {
	// more arguments are added to this struct
	// this avoids stack too deep errors
	struct DiamondArgs {
		address owner;
	}

	constructor(
		IDiamondCut.FacetCut[] memory _diamondCut,
		DiamondArgs memory _args
	) {
		LibDiamond.diamondCut(_diamondCut, address(0), new bytes(0));
		LibDiamond.setContractOwner(_args.owner);

		LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();

		// adding ERC165 data
		ds.supportedInterfaces[type(IERC165).interfaceId] = true;
		ds.supportedInterfaces[type(IDiamondCut).interfaceId] = true;
		ds.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
		ds.supportedInterfaces[type(IERC173).interfaceId] = true;
	}

	// Find facet for function that is called and execute the
	// function if a facet is found and return any value.
	// solhint-disable-next-line no-complex-fallback
	fallback() external payable {
		LibDiamond.DiamondStorage storage ds;
		bytes32 position = LibDiamond.DIAMOND_STORAGE_POSITION;
		// solhint-disable-next-line no-inline-assembly
		assembly {
			ds.slot := position
		}
		address facet = address(bytes20(ds.facets[msg.sig]));
		require(facet != address(0), "Diamond: Function does not exist");
		// solhint-disable-next-line no-inline-assembly
		assembly {
			calldatacopy(0, 0, calldatasize())
			let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
			returndatacopy(0, 0, returndatasize())
			switch result
				case 0 {
					revert(0, returndatasize())
				}
				default {
					return(0, returndatasize())
				}
		}
	}
}
