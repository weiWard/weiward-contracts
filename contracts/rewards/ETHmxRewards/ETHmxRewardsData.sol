// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

abstract contract ETHmxRewardsData {
	address internal _ethmx;
	address internal _weth;

	uint256[] internal _arptSnapshots;
	mapping(address => uint256) internal _arptLastIdx;

	uint256 internal _lastAccrualUpdate;
	uint256 internal _accrualUpdateInterval;

	mapping(address => uint256) internal _rewardsFor;
	uint256 internal _lastTotalRewardsAccrued;
	uint256 internal _totalRewardsRedeemed;

	mapping(address => uint256) internal _stakedFor;
	uint256 internal _totalStaked;

	uint256[39] private __gap;
}
