// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "./LibPausable.sol";
import "./IPausable.sol";
import "../access/Ownable.sol";

contract PausableFacet is Ownable, IPausable {
	function paused() external view override returns (bool) {
		return LibPausable.paused();
	}

	function pause() external override onlyOwner {
		LibPausable.pause();
	}

	function unpause() external override onlyOwner {
		LibPausable.unpause();
	}
}
