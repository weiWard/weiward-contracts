// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";

abstract contract RewardsManagerData {
	struct Shares {
		uint128 active;
		uint128 total;
	}

	address internal _rewardsToken;
	address internal _defaultRecipient;
	uint256 internal _totalRewardsRedeemed;
	EnumerableSet.AddressSet internal _recipients;
	mapping(address => Shares) internal _shares;

	uint256[45] private __gap;
}
