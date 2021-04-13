// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

abstract contract ETHtxAMMData {
	address internal _gasOracle;
	uint128 internal _targetCRatioNum;
	uint128 internal _targetCRatioDen;
	address internal _ethtx;
	address internal _weth;
}
