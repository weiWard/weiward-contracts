// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "../ETHmxRewards/ETHmxRewards.sol";

contract MockETHmxRewards is ETHmxRewards {
	constructor(address owner_) ETHmxRewards(owner_) {
		return;
	}

	function mockUpdateAccrual() external {
		_updateAccrual();
	}

	function setAccruedRewardsPerToken(uint256 value) external {
		_arptSnapshots.push(value);
	}

	function setLastTotalRewardsAccrued(uint256 value) external {
		_lastTotalRewardsAccrued = value;
	}

	function setTotalRewardsRedeemed(uint256 value) external {
		_totalRewardsRedeemed = value;
	}

	function setLastAccrualUpdate(uint256 value) external {
		_lastAccrualUpdate = value;
	}
}
