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

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./ETHmxMinterData.sol";
import "../../tokens/interfaces/IETHmx.sol";
import "../interfaces/IETHmxMinter.sol";
import "../../tokens/interfaces/IETHtx.sol";
import "../interfaces/IETHtxAMM.sol";
import "../../tokens/interfaces/IWETH.sol";
import "../../access/OwnableUpgradeable.sol";

interface IPool {
	function addLiquidity(
		address tokenA,
		address tokenB,
		uint256 amountADesired,
		uint256 amountBDesired,
		uint256 amountAMin,
		uint256 amountBMin,
		address to,
		uint256 deadline
	)
		external
		returns (
			uint256 amountA,
			uint256 amountB,
			uint256 liquidity
		);
}

contract ETHmxMinter is
	Initializable,
	ContextUpgradeable,
	OwnableUpgradeable,
	PausableUpgradeable,
	ETHmxMinterData,
	IETHmxMinter
{
	using EnumerableSet for EnumerableSet.AddressSet;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;
	using SafeMath for uint160;
	using SafeMath for uint16;

	struct ETHmxMinterArgs {
		address ethmx;
		address ethtx;
		address ethtxAMM;
		address weth;
		ETHmxMintParams ethmxMintParams;
		uint256 mintGasPrice;
		uint128 lpShareNumerator;
		uint128 lpShareDenominator;
		address[] lps;
		address lpRecipient;
	}

	/* Constructor */

	constructor(address owner_) {
		init(owner_);
	}

	/* Initializer */

	function init(address owner_) public virtual initializer {
		__Context_init_unchained();
		__Ownable_init_unchained(owner_);
		__Pausable_init_unchained();
	}

	function postInit(ETHmxMinterArgs memory _args) external virtual onlyOwner {
		address sender = _msgSender();

		_ethmx = _args.ethmx;
		emit EthmxSet(sender, _args.ethmx);

		_ethtx = _args.ethtx;
		emit EthtxSet(sender, _args.ethtx);

		_ethtxAMM = _args.ethtxAMM;
		emit EthtxAMMSet(sender, _args.ethtxAMM);

		_weth = _args.weth;
		emit WethSet(sender, _args.weth);

		_ethmxMintParams = _args.ethmxMintParams;
		emit EthmxMintParamsSet(sender, _args.ethmxMintParams);

		_mintGasPrice = _args.mintGasPrice;
		emit MintGasPriceSet(sender, _args.mintGasPrice);

		_lpShareNum = _args.lpShareNumerator;
		_lpShareDen = _args.lpShareDenominator;
		emit LpShareSet(sender, _args.lpShareNumerator, _args.lpShareDenominator);

		for (uint256 i = 0; i < _lps.length(); i++) {
			address lp = _lps.at(i);
			_lps.remove(lp);
			emit LpRemoved(sender, lp);
		}
		for (uint256 i = 0; i < _args.lps.length; i++) {
			address lp = _args.lps[i];
			_lps.add(lp);
			emit LpAdded(sender, lp);
		}

		_lpRecipient = _args.lpRecipient;
		emit LpRecipientSet(sender, _args.lpRecipient);
	}

	function addLp(address pool) external virtual override onlyOwner {
		bool added = _lps.add(pool);
		require(added, "ETHmxMinter: liquidity pool already added");
		emit LpAdded(_msgSender(), pool);
	}

	function mint() external payable virtual override whenNotPaused {
		uint256 amountIn = msg.value;
		require(amountIn != 0, "ETHmxMinter: cannot mint with zero amount");

		// Convert to WETH
		address weth_ = weth();
		IWETH(weth_).deposit{ value: amountIn }();

		// Mint ETHtx and send ETHtx-WETH pair.
		_mintEthtx(amountIn);

		// Mint ETHmx to sender.
		uint256 amountOut = ethmxFromEth(amountIn);
		_mint(_msgSender(), amountOut);
		_totalGiven += amountIn;
	}

	function mintWithETHtx(uint256 amount)
		external
		virtual
		override
		whenNotPaused
	{
		require(amount != 0, "ETHmxMinter: cannot mint with zero amount");

		IETHtxAMM ammHandle = IETHtxAMM(ethtxAMM());
		uint256 amountETHIn = ammHandle.ethToExactEthtx(amount);
		require(
			ammHandle.ethNeeded() >= amountETHIn,
			"ETHmxMinter: ETHtx value burnt exceeds ETH needed"
		);

		address account = _msgSender();
		IETHtx(ethtx()).burn(account, amount);

		_mint(account, amountETHIn);
	}

	function mintWithWETH(uint256 amount)
		external
		virtual
		override
		whenNotPaused
	{
		require(amount != 0, "ETHmxMinter: cannot mint with zero amount");
		address account = _msgSender();

		// Need ownership for router
		IERC20(weth()).safeTransferFrom(account, address(this), amount);

		// Mint ETHtx and send ETHtx-WETH pair.
		_mintEthtx(amount);

		uint256 amountOut = ethmxFromEth(amount);
		_mint(account, amountOut);
		_totalGiven += amount;
	}

	function pause() external virtual override onlyOwner {
		_pause();
	}

	function recoverERC20(
		address token,
		address to,
		uint256 amount
	) external virtual override onlyOwner {
		IERC20(token).safeTransfer(to, amount);
		emit Recovered(_msgSender(), token, to, amount);
	}

	function removeLp(address pool) external virtual override onlyOwner {
		bool removed = _lps.remove(pool);
		require(removed, "ETHmxMinter: liquidity pool not present");
		emit LpRemoved(_msgSender(), pool);
	}

	function setEthmx(address addr) public virtual override onlyOwner {
		_ethmx = addr;
		emit EthmxSet(_msgSender(), addr);
	}

	function setEthmxMintParams(ETHmxMintParams memory mp)
		public
		virtual
		override
		onlyOwner
	{
		_ethmxMintParams = mp;
		emit EthmxMintParamsSet(_msgSender(), mp);
	}

	function setEthtx(address addr) public virtual override onlyOwner {
		_ethtx = addr;
		emit EthtxSet(_msgSender(), addr);
	}

	function setEthtxAMM(address addr) public virtual override onlyOwner {
		_ethtxAMM = addr;
		emit EthtxAMMSet(_msgSender(), addr);
	}

	function setLpRecipient(address account)
		external
		virtual
		override
		onlyOwner
	{
		_lpRecipient = account;
		emit LpRecipientSet(_msgSender(), account);
	}

	function setLpShare(uint128 numerator, uint128 denominator)
		external
		virtual
		override
		onlyOwner
	{
		// Also guarantees that the denominator cannot be zero.
		require(denominator > numerator, "ETHmxMinter: cannot set lpShare >= 1");
		_lpShareNum = numerator;
		_lpShareDen = denominator;
		emit LpShareSet(_msgSender(), numerator, denominator);
	}

	function setMintGasPrice(uint256 value) public virtual override onlyOwner {
		_mintGasPrice = value;
		emit MintGasPriceSet(_msgSender(), value);
	}

	function setWeth(address addr) public virtual override onlyOwner {
		_weth = addr;
		emit WethSet(_msgSender(), addr);
	}

	function unpause() external virtual override onlyOwner {
		_unpause();
	}

	/* Public Views */

	function ethmx() public view virtual override returns (address) {
		return _ethmx;
	}

	function ethmxMintParams()
		public
		view
		virtual
		override
		returns (ETHmxMintParams memory)
	{
		return _ethmxMintParams;
	}

	function ethmxFromEth(uint256 amountETHIn)
		public
		view
		virtual
		override
		returns (uint256)
	{
		ETHmxMintParams memory mp = _ethmxMintParams;
		uint256 amountOut = _ethmxCurve(amountETHIn, mp);
		amountOut = _earlyCurve(amountETHIn, amountOut, mp.earlyThreshold);
		return amountOut;
	}

	function ethmxFromEthtx(uint256 amountETHtxIn)
		public
		view
		virtual
		override
		returns (uint256)
	{
		return IETHtxAMM(ethtxAMM()).ethToExactEthtx(amountETHtxIn);
	}

	function ethtx() public view virtual override returns (address) {
		return _ethtx;
	}

	function ethtxAMM() public view virtual override returns (address) {
		return _ethtxAMM;
	}

	function ethtxFromEth(uint256 amountETHIn)
		public
		view
		virtual
		override
		returns (uint256)
	{
		uint256 numerator = amountETHIn.mul(1e18);
		uint256 denominator =
			mintGasPrice().mul(IETHtxAMM(ethtxAMM()).gasPerETHtx());
		return numerator.div(denominator);
	}

	function numLiquidityPools()
		external
		view
		virtual
		override
		returns (uint256)
	{
		return _lps.length();
	}

	function liquidityPoolsAt(uint256 index)
		external
		view
		virtual
		override
		returns (address)
	{
		return _lps.at(index);
	}

	function lpRecipient() public view virtual override returns (address) {
		return _lpRecipient;
	}

	function lpShare()
		public
		view
		virtual
		override
		returns (uint128 numerator, uint128 denominator)
	{
		numerator = _lpShareNum;
		denominator = _lpShareDen;
	}

	function mintGasPrice() public view virtual override returns (uint256) {
		return _mintGasPrice;
	}

	function totalGiven() public view virtual override returns (uint256) {
		return _totalGiven;
	}

	function weth() public view virtual override returns (address) {
		return _weth;
	}

	/* Internal Views */

	function _earlyCurve(
		uint256 amountETHIn,
		uint256 amountOut,
		uint256 earlyThreshold
	) internal view virtual returns (uint256) {
		// Scale for output
		uint256 totalGiven_ = _totalGiven.mul(amountOut).div(amountETHIn);
		earlyThreshold = earlyThreshold.mul(amountOut).div(amountETHIn);

		// Check for early-bird rewards (will repeat after ~1e59 ETH given)
		if (totalGiven_ < earlyThreshold) {
			uint256 currentLeft = earlyThreshold - totalGiven_;
			if (amountOut < currentLeft) {
				amountOut = (2 *
					amountOut -
					(2 * totalGiven_ * amountOut + amountOut**2) /
					(2 * earlyThreshold));
			} else {
				amountOut += (currentLeft * currentLeft) / (2 * earlyThreshold);
			}
		}

		return amountOut;
	}

	function _ethmxCurve(uint256 amountETHIn, ETHmxMintParams memory mp)
		internal
		view
		virtual
		returns (uint256)
	{
		uint256 cRatioNum;
		uint256 cRatioDen;
		uint256 cTargetNum;
		uint256 cTargetDen;
		{
			IETHtxAMM ammHandle = IETHtxAMM(_ethtxAMM);
			(cRatioNum, cRatioDen) = ammHandle.cRatio();

			if (cRatioDen == 0) {
				// cRatio > cCap
				return amountETHIn.mul(mp.zetaFloorNum).div(mp.zetaFloorDen);
			}

			(cTargetNum, cTargetDen) = ammHandle.targetCRatio();
		}

		uint256 ethEnd = cRatioNum.add(amountETHIn);
		uint256 ethTarget = cRatioDen.mul(cTargetNum).div(cTargetDen);
		uint256 ethCap = cRatioDen.mul(mp.cCapNum).div(mp.cCapDen);
		if (cRatioNum >= ethCap) {
			// cRatio >= cCap
			return amountETHIn.mul(mp.zetaFloorNum).div(mp.zetaFloorDen);
		}

		if (cRatioNum < ethTarget) {
			// cRatio < cTarget
			if (ethEnd > ethCap) {
				// Add definite integral
				uint256 curveAmt =
					_ethmxDefiniteIntegral(
						ethCap - ethTarget,
						mp,
						cTargetNum,
						cTargetDen,
						ethTarget,
						cRatioDen
					);

				// Add amount past cap
				uint256 pastCapAmt =
					(ethEnd - ethCap).mul(mp.zetaFloorNum).div(mp.zetaFloorDen);

				// add initial amount
				uint256 flatAmt =
					(ethTarget - cRatioNum).mul(mp.zetaCeilNum).div(mp.zetaCeilDen);

				return flatAmt.add(curveAmt).add(pastCapAmt);
			} else if (ethEnd > ethTarget) {
				// Add definite integral for partial amount
				uint256 ethOver = ethEnd - ethTarget;
				uint256 curveAmt =
					_ethmxDefiniteIntegral(
						ethOver,
						mp,
						cTargetNum,
						cTargetDen,
						ethTarget,
						cRatioDen
					);

				uint256 ethBeforeCurve = amountETHIn - ethOver;
				uint256 flatAmt =
					ethBeforeCurve.mul(mp.zetaCeilNum).div(mp.zetaCeilDen);
				return flatAmt.add(curveAmt);
			}

			return amountETHIn.mul(mp.zetaCeilNum).div(mp.zetaCeilDen);
		}

		// cTarget < cRatio < cCap
		if (ethEnd > ethCap) {
			uint256 ethOver = ethEnd - ethCap;
			uint256 curveAmt =
				_ethmxDefiniteIntegral(
					amountETHIn - ethOver,
					mp,
					cTargetNum,
					cTargetDen,
					cRatioNum,
					cRatioDen
				);

			uint256 flatAmt = ethOver.mul(mp.zetaFloorNum).div(mp.zetaFloorDen);

			return curveAmt.add(flatAmt);
		}

		return
			_ethmxDefiniteIntegral(
				amountETHIn,
				mp,
				cTargetNum,
				cTargetDen,
				cRatioNum,
				cRatioDen
			);
	}

	function _ethmxDefiniteIntegral(
		uint256 amountETHIn,
		ETHmxMintParams memory mp,
		uint256 cTargetNum,
		uint256 cTargetDen,
		uint256 initCollateral,
		uint256 liability
	) internal pure virtual returns (uint256) {
		uint256 fctMulNum = mp.zetaFloorNum.mul(mp.zetaCeilDen).mul(cTargetDen);
		uint256 fctMulDen = mp.zetaFloorDen.mul(mp.zetaCeilNum).mul(cTargetNum);

		// prettier-ignore
		uint256 first =
			amountETHIn
			.mul(fctMulNum.mul(mp.cCapNum))
			.div(fctMulDen.mul(mp.cCapDen));

		uint256 second = amountETHIn.mul(mp.zetaFloorNum).div(mp.zetaFloorDen);

		uint256 tNum = fctMulNum.mul(amountETHIn);
		uint256 tDen = fctMulDen.mul(2).mul(liability);
		uint256 third = initCollateral.mul(2).add(amountETHIn);
		// avoids stack too deep error
		third = third.mul(tNum).div(tDen);

		return first.add(second).sub(third);
	}

	/* Internal Mutators */

	function _mint(address account, uint256 amount) internal virtual {
		IETHmx(ethmx()).mintTo(account, amount);
	}

	function _mintEthtx(uint256 amountEthIn) internal virtual {
		// Mint ETHtx.
		uint256 ethtxToMint = ethtxFromEth(amountEthIn);
		address ethtx_ = ethtx();
		IETHtx(ethtx_).mint(address(this), ethtxToMint);

		// Lock portion into liquidity in designated pools
		(uint256 ethtxSentToLp, uint256 ethSentToLp) = _sendToLps(ethtxToMint);

		// Send the rest to the AMM.
		address ethtxAmm_ = ethtxAMM();
		IERC20(weth()).safeTransfer(ethtxAmm_, amountEthIn.sub(ethSentToLp));
		IERC20(ethtx_).safeTransfer(ethtxAmm_, ethtxToMint.sub(ethtxSentToLp));
	}

	function _sendToLps(uint256 ethtxTotal)
		internal
		virtual
		returns (uint256 totalEthtxSent, uint256 totalEthSent)
	{
		uint256 numLps = _lps.length();
		if (numLps == 0) {
			return (0, 0);
		}

		(uint256 lpShareNum, uint256 lpShareDen) = lpShare();
		if (lpShareNum == 0) {
			return (0, 0);
		}

		uint256 ethtxToLp = ethtxTotal.mul(lpShareNum).div(lpShareDen).div(numLps);
		uint256 ethToLp = IETHtxAMM(ethtxAMM()).ethToExactEthtx(ethtxToLp);
		address ethtx_ = ethtx();
		address weth_ = weth();
		address to = lpRecipient();

		for (uint256 i = 0; i < numLps; i++) {
			address pool = _lps.at(i);

			IERC20(ethtx_).safeIncreaseAllowance(pool, ethtxToLp);
			IERC20(weth_).safeIncreaseAllowance(pool, ethToLp);

			(uint256 ethtxSent, uint256 ethSent, ) =
				IPool(pool).addLiquidity(
					ethtx_,
					weth_,
					ethtxToLp,
					ethToLp,
					0,
					0,
					to,
					// solhint-disable-next-line not-rely-on-time
					block.timestamp
				);

			totalEthtxSent = totalEthtxSent.add(ethtxSent);
			totalEthSent = totalEthSent.add(ethSent);
		}
	}
}
