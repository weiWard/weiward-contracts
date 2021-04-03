// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IERC2771Facet {
	function erc2771FacetInit() external;

	function msgSender() external view returns (address payable);

	function msgData() external view returns (bytes calldata);

	function setTrustedForwarder(address forwarder) external;

	event TrustedForwarderSet(address indexed author, address indexed forwarder);
}
