// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "../RewardsManager/RewardsManager.sol";

contract MockRewardsManager is RewardsManager {
	constructor(address owner_) RewardsManager(owner_) {
		return;
	}

	function setTotalRewardsRedeemed(uint256 value) external {
		_totalRewardsRedeemed = value;
	}
}
