// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../ETHtxRewardsManager.sol";

contract MockETHtxRewardsManager is ETHtxRewardsManager {
	constructor(
		address owner_,
		address defaultRecipient_,
		address rewardsToken_,
		address ethmxRewards_,
		address ethtx_,
		address ethtxAMM_,
		address lpRewards_
	)
		ETHtxRewardsManager(
			owner_,
			defaultRecipient_,
			rewardsToken_,
			ethmxRewards_,
			ethtx_,
			ethtxAMM_,
			lpRewards_
		)
	{
		return;
	}

	function setTotalRewardsRedeemed(uint256 value) external {
		_totalRewardsRedeemed = value;
	}
}
