// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import { LibPausable } from "./LibPausable.sol";

contract Pausable {
	/**
	 * @dev Modifier to make a function callable only when the contract is not paused.
	 *
	 * Requirements:
	 *
	 * - The contract must not be paused.
	 */
	modifier whenNotPaused() {
		require(!LibPausable.paused(), "Pausable: paused");
		_;
	}

	/**
	 * @dev Modifier to make a function callable only when the contract is paused.
	 *
	 * Requirements:
	 *
	 * - The contract must be paused.
	 */
	modifier whenPaused() {
		require(LibPausable.paused(), "Pausable: not paused");
		_;
	}
}
