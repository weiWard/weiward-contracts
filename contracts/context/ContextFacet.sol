// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "./IContext.sol";

// Prep for upgrade to EIP-2771
contract ContextFacet is IContext {
	function msgSender() external view override returns (address payable) {
		return msg.sender;
	}

	function msgData() external view override returns (bytes calldata) {
		this; // silence state mutability warning without generating bytecode
		return msg.data;
	}
}
