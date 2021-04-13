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

	function numLiquidityPools() external view returns (uint256);

	function liquidityPoolsAt(uint256 index) external view returns (address);

	function lpRecipient() external view returns (address);

	function lpShare()
		external
		view
		returns (uint128 numerator, uint128 denominator);

	function mintGasPrice() external view returns (uint256);

	function roi()
		external
		view
		returns (uint128 numerator, uint128 denominator);

	function totalGiven() external view returns (uint256);

	function weth() external view returns (address);

	/* Mutators */

	function addLp(address pool) external;

	function mint() external payable;

	function mintWithETHtx(uint256 amountIn) external;

	function mintWithWETH(uint256 amountIn) external;

	function pause() external;

	function recoverERC20(
		address token,
		address to,
		uint256 amount
	) external;

	function removeLp(address pool) external;

	function setEarlyThreshold(uint256 value) external;

	function setEthmx(address addr) external;

	function setEthtx(address addr) external;

	function setEthtxAMM(address addr) external;

	function setLpRecipient(address account) external;

	function setLpShare(uint128 numerator, uint128 denominator) external;

	function setMintGasPrice(uint256 value) external;

	function setRoi(uint128 numerator, uint128 denominator) external;

	function setWeth(address addr) external;

	function unpause() external;

	/* Events */

	event EarlyThresholdSet(address indexed author, uint256 value);
	event EthmxSet(address indexed author, address indexed addr);
	event EthtxSet(address indexed author, address indexed addr);
	event EthtxAMMSet(address indexed author, address indexed addr);
	event LpAdded(address indexed author, address indexed account);
	event LpRecipientSet(address indexed author, address indexed account);
	event LpRemoved(address indexed author, address indexed account);
	event LpShareSet(
		address indexed author,
		uint128 numerator,
		uint128 denominator
	);
	event MintGasPriceSet(address indexed author, uint256 value);
	event Recovered(
		address indexed author,
		address indexed token,
		address indexed to,
		uint256 amount
	);
	event RoiSet(address indexed author, uint128 numerator, uint128 denominator);
	event WethSet(address indexed author, address indexed addr);
}
