// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface IETHtxAMM {
	/* Views */

	function cRatio()
		external
		view
		returns (uint256 numerator, uint256 denominator);

	function cRatioBelowTarget() external view returns (bool);

	function ethForEthtx(uint256 amountETHtxOut) external view returns (uint256);

	function ethFromEthtxAtRedemption(uint256 amountETHtxIn)
		external
		view
		returns (uint256);

	function ethtx() external view returns (address);

	function ethtxFromEth(uint256 amountETHIn) external view returns (uint256);

	function ethtxForEthAtRedemption(uint256 amountETHOut)
		external
		view
		returns (uint256);

	function ethSupply() external view returns (uint256);

	function ethtxAvailable() external view returns (uint256);

	function ethtxOutstanding() external view returns (uint256);

	function feeLogic() external view returns (address);

	function gasOracle() external view returns (address);

	function gasPerETHtx() external pure returns (uint256);

	function gasPrice() external view returns (uint256);

	function gasPriceAtRedemption() external view returns (uint256);

	function maxGasPrice() external view returns (uint256);

	function targetCRatio()
		external
		view
		returns (uint128 numerator, uint128 denominator);

	function weth() external view returns (address);

	/* Mutators */

	function buy(uint256 deadline) external payable;

	function buyWithWETH(uint256 amountIn, uint256 deadline) external;

	function buyExact(uint256 amountOut, uint256 deadline) external payable;

	function buyExactWithWETH(
		uint256 amountInMax,
		uint256 amountOut,
		uint256 deadline
	) external;

	function buyWithExactETH(uint256 amountOutMin, uint256 deadline)
		external
		payable;

	function buyWithExactWETH(
		uint256 amountIn,
		uint256 amountOutMin,
		uint256 deadline
	) external;

	function pause() external;

	function redeem(uint256 amountIn, uint256 deadline) external;

	function redeemExact(
		uint256 amountInMax,
		uint256 amountOut,
		uint256 deadline
	) external;

	function redeemWithExact(
		uint256 amountIn,
		uint256 amountOutMin,
		uint256 deadline
	) external;

	function setGasOracle(address account) external;

	function setTargetCRatio(uint128 numerator, uint128 denominator) external;

	function unpause() external;

	/* Events */

	event GasOracleSet(address indexed author, address indexed account);
	event TargetCRatioSet(
		address indexed author,
		uint128 numerator,
		uint128 denominator
	);
}
