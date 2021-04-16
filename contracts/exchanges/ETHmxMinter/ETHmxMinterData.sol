// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";

abstract contract ETHmxMinterData {
	uint256 internal _earlyThreshold;
	address internal _ethmx;
	address internal _ethtx;
	address internal _ethtxAMM;
	uint256 internal _mintGasPrice;
	uint128 internal _roiNum;
	uint128 internal _roiDen;
	uint256 internal _totalGiven;
	address internal _weth;
	uint128 internal _lpShareNum;
	uint128 internal _lpShareDen;
	EnumerableSet.AddressSet internal _lps;
	address internal _lpRecipient;

	uint256[37] private __gap;
}
