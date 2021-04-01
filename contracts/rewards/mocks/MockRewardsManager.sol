// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../RewardsManager.sol";

contract MockRewardsManager is RewardsManager {
	constructor(address defaultRecipient_, address rewardsToken_)
		RewardsManager(defaultRecipient_, rewardsToken_)
	{
		return;
	}

	function setTotalRewardsRedeemed(uint256 value) external {
		_totalRewardsRedeemed = value;
	}
}
