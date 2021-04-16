// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";

import "../../libraries/EnumerableMap.sol";

abstract contract LPRewardsData {
	/* Structs */

	struct TokenData {
		uint256 arpt;
		uint256 lastRewardsAccrued;
		uint256 rewards;
		uint256 rewardsRedeemed;
		uint256 totalStaked;
		address valueImpl;
	}

	struct UserTokenRewards {
		uint256 pending;
		uint256 arptLast;
	}

	struct UserData {
		EnumerableSet.AddressSet tokensWithRewards;
		mapping(address => UserTokenRewards) rewardsFor;
		EnumerableMap.AddressToUintMap staked;
	}

	/* State */

	address internal _rewardsToken;
	uint256 internal _lastTotalRewardsAccrued;
	uint256 internal _totalRewardsRedeemed;
	uint256 internal _unredeemableRewards;
	EnumerableSet.AddressSet internal _tokens;
	mapping(address => TokenData) internal _tokenData;
	mapping(address => UserData) internal _users;

	uint256[43] private __gap;
}
