// SPDX-License-Identifier: Apache-2.0

/**
 * Copyright 2021 weiWard LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

pragma solidity 0.7.6;
pragma abicoder v2;

interface IETHmxMinter {
	/* Types */

	struct ETHmxMintParams {
		// Uses a single 32 byte slot and avoids stack too deep errors
		uint160 earlyThreshold;
		uint16 cCapNum;
		uint16 cCapDen;
		uint16 zetaFloorNum;
		uint16 zetaFloorDen;
		uint16 zetaCeilNum;
		uint16 zetaCeilDen;
	}

	/* Views */

	function ethmx() external view returns (address);

	function ethmxMintParams() external view returns (ETHmxMintParams memory);

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

	function setEthmx(address addr) external;

	function setEthmxMintParams(ETHmxMintParams memory mp) external;

	function setEthtx(address addr) external;

	function setEthtxAMM(address addr) external;

	function setLpRecipient(address account) external;

	function setLpShare(uint128 numerator, uint128 denominator) external;

	function setMintGasPrice(uint256 value) external;

	function setWeth(address addr) external;

	function unpause() external;

	/* Events */

	event EthmxSet(address indexed author, address indexed addr);
	event EthmxMintParamsSet(address indexed author, ETHmxMintParams mp);
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
	event WethSet(address indexed author, address indexed addr);
}
