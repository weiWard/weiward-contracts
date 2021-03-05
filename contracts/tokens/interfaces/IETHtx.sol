// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface IETHtx {
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

	function ethtxFromEth(uint256 amountETHIn) external view returns (uint256);

	function ethtxForEthAtRedemption(uint256 amountETHOut)
		external
		view
		returns (uint256);

	function ethSupply() external view returns (uint256);

	function ethtxAvailable() external view returns (uint256);

	function ethtxOutstanding() external view returns (uint256);

	function gasOracle() external view returns (address);

	function gasPerETHtx() external pure returns (uint256);

	function gasPrice() external view returns (uint256);

	function gasPriceAtRedemption() external view returns (uint256);

	function maxGasPrice() external view returns (uint256);

	function targetCRatio()
		external
		view
		returns (uint128 numerator, uint128 denominator);

	/* Mutators */

	function burn(address account, uint256 amount) external;

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

	function mint(address account, uint256 amount) external;

	function pause() external;

	function redeem(
		uint256 amountIn,
		bool asWETH,
		uint256 deadline
	) external;

	function redeemExact(
		uint256 amountInMax,
		uint256 amountOut,
		bool asWETH,
		uint256 deadline
	) external;

	function redeemWithExact(
		uint256 amountIn,
		uint256 amountOutMin,
		bool asWETH,
		uint256 deadline
	) external;

	function setFeeLogic(address account) external;

	function setGasOracle(address account) external;

	function setMinter(address account) external;

	function setTargetCRatio(uint128 numerator, uint128 denominator) external;

	function unpause() external;

	/* Events */

	event FeeLogicSet(address indexed account);
	event GasOracleSet(address indexed account);
	event MinterSet(address indexed account);
	event TargetCRatioSet(uint128 numerator, uint128 denominator);
}
