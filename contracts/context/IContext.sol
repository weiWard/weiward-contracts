// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IContext {
	function msgSender() external view returns (address payable);

	function msgData() external view returns (bytes calldata);
}
