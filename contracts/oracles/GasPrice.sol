// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

// Accuracy in block.timestamp is not needed.
// https://consensys.github.io/smart-contract-best-practices/recommendations/#the-15-second-rule
/* solhint-disable not-rely-on-time */

contract GasPrice is AccessControl {
	using SafeMath for uint256;

	event GasPriceUpdate(address indexed author, uint256 newValue);

	bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
	uint256 public gasPrice;
	uint256 public updateThreshold;
	uint256 public updatedAt;

	constructor(uint256 _updateThreshold, uint256 _gasPrice) {
		_setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
		updateThreshold = _updateThreshold;
		_setGasPrice(_gasPrice);
	}

	function setGasPrice(uint256 _gasPrice) public {
		require(
			hasRole(ORACLE_ROLE, msg.sender),
			"Caller is not a trusted oracle source."
		);
		_setGasPrice(_gasPrice);
	}

	function setUpdateThreshold(uint256 _updateThreshold) public {
		require(
			hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
			"Caller is not the contract admin."
		);
		updateThreshold = _updateThreshold;
	}

	function hasPriceExpired() public view returns (bool) {
		return block.timestamp.sub(updatedAt) > updateThreshold;
	}

	function _setGasPrice(uint256 _gasPrice) internal {
		// update public values
		updatedAt = block.timestamp;
		gasPrice = _gasPrice;
		emit GasPriceUpdate(msg.sender, _gasPrice);
	}
}
