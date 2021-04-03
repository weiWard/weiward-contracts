// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import { LibDiamond } from "../../diamond/libraries/LibDiamond.sol";
import { LibERC2771, ERC2771Storage } from "./LibERC2771.sol";
import { Ownable } from "../../access/Ownable.sol";
import { IERC2771 } from "../../interfaces/IERC2771.sol";
import { IERC2771Facet } from "./IERC2771Facet.sol";

// See EIP-2771: https://eips.ethereum.org/EIPS/eip-2771
contract ERC2771Facet is Ownable, IERC2771, IERC2771Facet {
	function erc2771FacetInit() external override {
		LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
		// Add ERC165 data
		ds.supportedInterfaces[type(IERC2771).interfaceId] = true;
	}

	function isTrustedForwarder(address forwarder)
		public
		view
		override
		returns (bool)
	{
		ERC2771Storage storage cs = LibERC2771.erc2771Storage();
		return forwarder == cs.trustedForwarder;
	}

	function msgSender()
		external
		view
		override
		returns (address payable sender)
	{
		if (isTrustedForwarder(msg.sender)) {
			// solhint-disable-next-line no-inline-assembly
			assembly {
				sender := shr(96, calldataload(sub(calldatasize(), 20)))
			}
		} else {
			return msg.sender;
		}
	}

	function msgData() external view override returns (bytes calldata) {
		if (isTrustedForwarder(msg.sender)) {
			return msg.data[0:msg.data.length - 20];
		} else {
			this; // silence state mutability warning without generating bytecode
			return msg.data;
		}
	}

	function setTrustedForwarder(address forwarder) external override onlyOwner {
		ERC2771Storage storage cs = LibERC2771.erc2771Storage();
		cs.trustedForwarder = forwarder;
		emit TrustedForwarderSet(msg.sender, forwarder);
	}
}
