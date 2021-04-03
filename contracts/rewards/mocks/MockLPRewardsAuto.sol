// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../LPRewardsAuto.sol";

contract MockLPRewardsAuto is LPRewardsAuto {
	constructor(address _rewardsToken) LPRewardsAuto(_rewardsToken) {
		return;
	}

	function multiplier() public pure returns (uint256) {
		return _MULTIPLIER;
	}

	function setAccruedRewardsPerTokenFor(address token, uint256 value) public {
		_tokenData[token].accruedRewardsPerToken = value;
	}

	function setRewardsRedeemedFor(address token, uint256 value) public {
		_tokenData[token].rewardsRedeemed = value;
	}

	function setLastRewardsAccruedFor(address token, uint256 value) public {
		_tokenData[token].lastRewardsAccrued = value;
	}

	function setLastTotalRewardsAccrued(uint256 value) public {
		_lastTotalRewardsAccrued = value;
	}

	function setTotalRewardsRedeemed(uint256 value) public {
		_totalRewardsRedeemed = value;
	}
}
