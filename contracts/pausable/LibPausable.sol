// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

library LibPausable {
	bytes32 public constant PAUSABLE_STORAGE_POSITION =
		keccak256("org.weiWard.pausable.storage");

	struct PausableStorage {
		bool paused;
	}

	function pausableStorage()
		internal
		pure
		returns (PausableStorage storage s)
	{
		bytes32 position = PAUSABLE_STORAGE_POSITION;
		// solhint-disable-next-line no-inline-assembly
		assembly {
			s.slot := position
		}
	}

	/**
	 * @dev Returns true if the contract is paused, and false otherwise.
	 */
	function paused() internal view returns (bool) {
		return pausableStorage().paused;
	}

	/**
	 * @dev Emitted when the pause is triggered by `account`.
	 */
	event Paused(address account);

	/**
	 * @dev Triggers stopped state.
	 *
	 * Requirements:
	 *
	 * - The contract must not be paused.
	 */
	function pause() internal {
		PausableStorage storage ps = pausableStorage();
		require(!ps.paused, "Pausable: paused");
		ps.paused = true;
		emit Paused(msg.sender);
	}

	/**
	 * @dev Emitted when the pause is lifted by `account`.
	 */
	event Unpaused(address account);

	/**
	 * @dev Returns to normal state.
	 *
	 * Requirements:
	 *
	 * - The contract must be paused.
	 */
	function unpause() internal {
		PausableStorage storage ps = pausableStorage();
		require(ps.paused, "Pausable: not paused");
		ps.paused = false;
		emit Unpaused(msg.sender);
	}
}
