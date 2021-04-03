// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IGasPrice {
	/* Views */

	function gasPrice() external view returns (uint256);

	function hasPriceExpired() external view returns (bool);

	function updateThreshold() external view returns (uint256);

	function updatedAt() external view returns (uint256);

	/* Mutators */

	function setGasPrice(uint256 _gasPrice) external;

	function setUpdateThreshold(uint256 _updateThreshold) external;

	/* Events */

	event GasPriceUpdate(address indexed author, uint256 newValue);
	event UpdateThresholdSet(address indexed author, uint256 value);
}
