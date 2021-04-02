// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import { LibDiamond } from "../diamond/libraries/LibDiamond.sol";

contract Ownable {
	modifier onlyOwner() {
		require(
			msg.sender == LibDiamond.contractOwner(),
			"Ownable: caller is not the owner"
		);
		_;
	}
}
