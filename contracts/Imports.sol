// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "hardhat-deploy/solc_0.7/openzeppelin/proxy/ProxyAdmin.sol";

// Get the compiler and hardhat-deploy to pick this up
contract Imports {
	ProxyAdmin public proxyAdmin;
}
