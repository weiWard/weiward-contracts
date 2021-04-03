// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../ETHtxRewardsManager.sol";

contract MockETHtxRewardsManager is ETHtxRewardsManager {
	constructor(address defaultRecipient_, address rewardsToken_)
		ETHtxRewardsManager(defaultRecipient_, rewardsToken_)
	{
		return;
	}

	function setTotalRewardsRedeemed(uint256 value) external {
		_totalRewardsRedeemed = value;
	}
}
