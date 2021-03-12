// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface IETHmx {
	/* Views */

	function earlyThreshold() external view returns (uint256);

	function ethmxFromEth(uint256 amountETHIn) external view returns (uint256);

	function ethmxFromEthtx(uint256 amountETHtxIn)
		external
		view
		returns (uint256);

	function ethtxAddr() external view returns (address);

	function ethtxFromEth(uint256 amountETHIn) external view returns (uint256);

	function mintGasPrice() external view returns (uint256);

	function roi()
		external
		view
		returns (uint128 numerator, uint128 denominator);

	function totalGiven() external view returns (uint256);

	function wethAddr() external view returns (address);

	/* Mutators */

	function burn(uint256 amount) external;

	function mint() external payable;

	function mintWithETHtx(uint256 amountIn) external;

	function mintWithWETH(uint256 amountIn) external;

	function pause() external;

	function recoverERC20(
		address token,
		address to,
		uint256 amount
	) external;

	function setEthtxAddress(address addr) external;

	function setMintGasPrice(uint256 value) external;

	function setRoi(uint128 numerator, uint128 denominator) external;

	function unpause() external;

	/* Events */

	event EthtxAddressSet(address indexed author, address indexed addr);
	event MintGasPriceSet(address indexed author, uint256 value);
	event Recovered(
		address indexed author,
		address indexed token,
		address indexed to,
		uint256 amount
	);
	event RoiSet(address indexed author, uint128 numerator, uint128 denominator);
}
