// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../ETHmxRewards.sol";

contract MockETHmxRewards is ETHmxRewards {
	constructor(address ethmxAddr_, address wethAddr_)
		ETHmxRewards(ethmxAddr_, wethAddr_)
	{
		return;
	}

	function setAccruedRewardsPerToken(uint256 value) external {
		_accruedRewardsPerToken = value;
	}

	function setLastTotalRewardsAccrued(uint256 value) external {
		_lastTotalRewardsAccrued = value;
	}

	function setTotalRewardsRedeemed(uint256 value) external {
		_totalRewardsRedeemed = value;
	}
}
