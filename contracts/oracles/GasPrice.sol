// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IGasPrice.sol";

// Accuracy in block.timestamp is not needed.
// https://consensys.github.io/smart-contract-best-practices/recommendations/#the-15-second-rule
/* solhint-disable not-rely-on-time */

contract GasPrice is AccessControl, IGasPrice {
	using SafeMath for uint256;

	bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
	uint256 public override gasPrice;
	uint256 public override updateThreshold;
	uint256 public override updatedAt;

	constructor(uint256 _updateThreshold, uint256 _gasPrice) {
		_setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
		_setUpdateThreshold(_updateThreshold);
		_setGasPrice(_gasPrice);
	}

	function setGasPrice(uint256 _gasPrice) external override {
		require(
			hasRole(ORACLE_ROLE, msg.sender),
			"Caller is not a trusted oracle source."
		);
		_setGasPrice(_gasPrice);
	}

	function setUpdateThreshold(uint256 _updateThreshold) external override {
		require(
			hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
			"Caller is not the contract admin."
		);
		_setUpdateThreshold(_updateThreshold);
	}

	function hasPriceExpired() external view override returns (bool) {
		uint256 timePassed =
			block.timestamp.sub(
				updatedAt,
				"GasPrice: block is older than last update"
			);
		return timePassed > updateThreshold;
	}

	function _setGasPrice(uint256 _gasPrice) internal {
		// update public values
		updatedAt = block.timestamp;
		gasPrice = _gasPrice;
		emit GasPriceUpdate(msg.sender, _gasPrice);
	}

	function _setUpdateThreshold(uint256 _updateThreshold) internal {
		updateThreshold = _updateThreshold;
		emit UpdateThresholdSet(msg.sender, _updateThreshold);
	}
}
