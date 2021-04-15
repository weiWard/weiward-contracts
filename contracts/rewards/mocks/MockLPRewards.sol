// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../LPRewards/LPRewards.sol";

contract MockLPRewards is LPRewards {
	constructor(address owner_) LPRewards(owner_) {
		return;
	}

	function multiplier() external pure returns (uint256) {
		return _MULTIPLIER;
	}

	function setAccruedRewardsPerTokenFor(address token, uint256 value)
		external
	{
		_tokenData[token].arpt = value;
	}

	function setRewardsRedeemedFor(address token, uint256 value) external {
		_tokenData[token].rewardsRedeemed = value;
	}

	function setLastRewardsAccruedFor(address token, uint256 value) external {
		_tokenData[token].lastRewardsAccrued = value;
	}

	function setLastTotalRewardsAccrued(uint256 value) external {
		_lastTotalRewardsAccrued = value;
	}

	function setTotalRewardsRedeemed(uint256 value) external {
		_totalRewardsRedeemed = value;
	}
}
