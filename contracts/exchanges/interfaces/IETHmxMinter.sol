// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IETHmxMinter {
	/* Views */

	function earlyThreshold() external view returns (uint256);

	function ethmx() external view returns (address);

	function ethmxFromEth(uint256 amountETHIn) external view returns (uint256);

	function ethmxFromEthtx(uint256 amountETHtxIn)
		external
		view
		returns (uint256);

	function ethtx() external view returns (address);

	function ethtxAMM() external view returns (address);

	function ethtxFromEth(uint256 amountETHIn) external view returns (uint256);

	function mintGasPrice() external view returns (uint256);

	function roi()
		external
		view
		returns (uint128 numerator, uint128 denominator);

	function totalGiven() external view returns (uint256);

	function weth() external view returns (address);

	/* Mutators */

	function mint() external payable;

	function mintWithETHtx(uint256 amountIn) external;

	function mintWithWETH(uint256 amountIn) external;

	function pause() external;

	function recoverERC20(
		address token,
		address to,
		uint256 amount
	) external;

	function setEarlyThreshold(uint256 value) external;

	function setEthmxAddress(address addr) external;

	function setEthtxAddress(address addr) external;

	function setEthtxAMMAddress(address addr) external;

	function setMintGasPrice(uint256 value) external;

	function setRoi(uint128 numerator, uint128 denominator) external;

	function setWethAddress(address addr) external;

	function unpause() external;

	/* Events */

	event EarlyThresholdSet(address indexed author, uint256 value);
	event EthmxAddressSet(address indexed author, address indexed addr);
	event EthtxAddressSet(address indexed author, address indexed addr);
	event EthtxAMMAddressSet(address indexed author, address indexed addr);
	event MintGasPriceSet(address indexed author, uint256 value);
	event Recovered(
		address indexed author,
		address indexed token,
		address indexed to,
		uint256 amount
	);
	event RoiSet(address indexed author, uint128 numerator, uint128 denominator);
	event WethAddressSet(address indexed author, address indexed addr);
}
