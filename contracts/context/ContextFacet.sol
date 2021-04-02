// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import { LibDiamond } from "../diamond/libraries/LibDiamond.sol";
import { LibContext } from "./LibContext.sol";
import { Ownable } from "../access/Ownable.sol";
import { IERC2771 } from "../interfaces/IERC2771.sol";
import { IContextFacet } from "./IContextFacet.sol";

// See EIP-2771: https://eips.ethereum.org/EIPS/eip-2771
contract ContextFacet is Ownable, IERC2771, IContextFacet {
	function initialize(address trustedForwarder) external override {
		LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();

		require(
			msg.sender == ds.contractOwner,
			"ContextFacet: caller is not the owner"
		);

		LibContext.ContextStorage storage cs = LibContext.contextStorage();

		// Not critical if initialize is called multiple times.
		require(
			cs.trustedForwarder != address(0),
			"ContextFacet: already initialized"
		);

		cs.trustedForwarder = trustedForwarder;
		emit TrustedForwarderSet(msg.sender, trustedForwarder);

		// Add ERC165 data
		ds.supportedInterfaces[type(IERC2771).interfaceId] = true;
	}

	function isTrustedForwarder(address forwarder)
		public
		view
		override
		returns (bool)
	{
		LibContext.ContextStorage storage cs = LibContext.contextStorage();
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
		LibContext.ContextStorage storage cs = LibContext.contextStorage();
		cs.trustedForwarder = forwarder;
		emit TrustedForwarderSet(msg.sender, forwarder);
	}
}
