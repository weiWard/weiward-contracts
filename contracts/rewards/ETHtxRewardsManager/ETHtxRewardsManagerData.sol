// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

abstract contract ETHtxRewardsManagerData {
	address internal _ethmxRewards;
	address internal _ethtx;
	address internal _ethtxAMM;
	address internal _lpRewards;

	uint256[46] private __gap;
}
