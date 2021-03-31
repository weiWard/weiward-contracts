// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IETHtxAMM.sol";
import "../tokens/interfaces/IETHtx.sol";
import "../tokens/interfaces/IERC20TxFee.sol";
import "../tokens/interfaces/IWETH.sol";
import "../rewards/interfaces/IFeeLogic.sol";
import "../oracles/interfaces/IGasPrice.sol";

contract ETHtxAMM is Ownable, Pausable, IETHtxAMM {
	using Address for address payable;
	using SafeERC20 for IERC20;
	using SafeMath for uint128;
	using SafeMath for uint256;

	/* Mutable Internal State */
	address internal _gasOracle;
	uint128 internal _targetCRatioNum;
	uint128 internal _targetCRatioDen;

	/* Immutable Private State */

	address private immutable _ethtx;
	address private immutable _weth;

	/* Constructor */

	constructor(
		address ethtx_,
		address gasOracle_,
		address wethAddr_,
		uint128 targetCRatioNumerator,
		uint128 targetCRatioDenominator
	) Ownable() {
		setGasOracle(gasOracle_);
		setTargetCRatio(targetCRatioNumerator, targetCRatioDenominator);
		_ethtx = ethtx_;
		_weth = wethAddr_;
	}

	/* Modifiers */

	modifier ensure(uint256 deadline) {
		// solhint-disable-next-line not-rely-on-time
		require(deadline >= block.timestamp, "ETHtxAMM: expired");
		_;
	}

	modifier priceIsFresh() {
		require(
			!IGasPrice(gasOracle()).hasPriceExpired(),
			"ETHtxAMM: gas price is outdated"
		);
		_;
	}

	/* Fallbacks */

	receive() external payable {
		// Only accept random ETH if we can convert it to WETH
		IWETH(weth()).deposit{ value: msg.value }();
	}

	/* External Mutators */

	function buy(uint256 deadline)
		external
		payable
		virtual
		override
		ensure(deadline)
		priceIsFresh
	{
		uint256 amountIn = msg.value;
		uint256 amountOut = ethtxFromEth(amountIn);
		_buy(_msgSender(), amountIn, amountOut, false);
	}

	function buyWithWETH(uint256 amountIn, uint256 deadline)
		external
		virtual
		override
		ensure(deadline)
		priceIsFresh
	{
		uint256 amountOut = ethtxFromEth(amountIn);
		_buy(_msgSender(), amountIn, amountOut, true);
	}

	function buyExact(uint256 amountOut, uint256 deadline)
		external
		payable
		virtual
		override
		ensure(deadline)
		priceIsFresh
	{
		address account = _msgSender();
		uint256 amountIn = ethForEthtx(amountOut);
		require(amountIn <= msg.value, "ETHtxAMM: amountIn exceeds max");
		_buy(account, amountIn, amountOut, false);
		// refund leftover ETH
		if (msg.value > amountIn) {
			payable(account).sendValue(msg.value - amountIn);
		}
	}

	function buyExactWithWETH(
		uint256 amountInMax,
		uint256 amountOut,
		uint256 deadline
	) external virtual override ensure(deadline) priceIsFresh {
		uint256 amountIn = ethForEthtx(amountOut);
		require(amountIn <= amountInMax, "ETHtxAMM: amountIn exceeds max");
		_buy(_msgSender(), amountIn, amountOut, true);
	}

	function buyWithExactETH(uint256 amountOutMin, uint256 deadline)
		external
		payable
		virtual
		override
		ensure(deadline)
		priceIsFresh
	{
		uint256 amountIn = msg.value;
		uint256 amountOut = ethtxFromEth(amountIn);
		require(amountOut >= amountOutMin, "ETHtxAMM: amountOut below min");
		_buy(_msgSender(), amountIn, amountOut, false);
	}

	function buyWithExactWETH(
		uint256 amountIn,
		uint256 amountOutMin,
		uint256 deadline
	) external virtual override ensure(deadline) priceIsFresh {
		uint256 amountOut = ethtxFromEth(amountIn);
		require(amountOut >= amountOutMin, "ETHtxAMM: amountOut below min");
		_buy(_msgSender(), amountIn, amountOut, true);
	}

	function pause() external virtual override onlyOwner whenNotPaused {
		_pause();
	}

	function recoverUnsupportedERC20(
		address token,
		address to,
		uint256 amount
	) external override onlyOwner {
		require(token != weth(), "ETHtxAMM: cannot recover WETH");
		require(token != ethtx(), "ETHtxAMM: cannot recover ETHtx");

		IERC20(token).safeTransfer(to, amount);
		emit RecoveredUnsupported(_msgSender(), token, to, amount);
	}

	function redeem(uint256 amountIn, uint256 deadline)
		external
		virtual
		override
		ensure(deadline)
		priceIsFresh
	{
		uint256 amountOut = ethFromEthtxAtRedemption(amountIn);
		_redeem(_msgSender(), amountIn, amountOut);
	}

	function redeemExact(
		uint256 amountInMax,
		uint256 amountOut,
		uint256 deadline
	) external virtual override ensure(deadline) priceIsFresh {
		uint256 amountIn = ethtxForEthAtRedemption(amountOut);
		require(amountIn <= amountInMax, "ETHtxAMM: amountIn exceeds max");
		_redeem(_msgSender(), amountIn, amountOut);
	}

	function redeemWithExact(
		uint256 amountIn,
		uint256 amountOutMin,
		uint256 deadline
	) external virtual override ensure(deadline) priceIsFresh {
		uint256 amountOut = ethFromEthtxAtRedemption(amountIn);
		require(amountOut >= amountOutMin, "ETHtxAMM: amountOut below min");
		_redeem(_msgSender(), amountIn, amountOut);
	}

	function setGasOracle(address account) public virtual override onlyOwner {
		require(account != address(0), "ETHtxAMM: gasOracle zero address");
		_gasOracle = account;
		emit GasOracleSet(_msgSender(), account);
	}

	function setTargetCRatio(uint128 numerator, uint128 denominator)
		public
		virtual
		override
		onlyOwner
	{
		require(numerator != 0, "ETHtxAMM: targetCRatio numerator is zero");
		require(denominator != 0, "ETHtxAMM: targetCRatio denominator is zero");
		_targetCRatioNum = numerator;
		_targetCRatioDen = denominator;
		emit TargetCRatioSet(_msgSender(), numerator, denominator);
	}

	function unpause() external virtual override onlyOwner whenPaused {
		_unpause();
	}

	/* Public Pure */

	function gasPerETHtx() public pure virtual override returns (uint256) {
		return 21000; // Per 1e18
	}

	/* Public Views */

	function cRatio()
		public
		view
		virtual
		override
		returns (uint256 numerator, uint256 denominator)
	{
		numerator = ethSupply();
		denominator = ethForEthtx(ethtxOutstanding());
	}

	function cRatioBelowTarget() public view virtual override returns (bool) {
		(uint256 cRatioNum, uint256 cRatioDen) = cRatio();
		if (cRatioDen == 0) {
			return false;
		}

		uint256 current = cRatioNum.mul(1e18) / cRatioDen;

		(uint256 targetNum, uint256 targetDen) = targetCRatio();
		uint256 target = targetNum.mul(1e18).div(targetDen);

		return current < target;
	}

	function ethForEthtx(uint256 amountETHtxOut)
		public
		view
		virtual
		override
		returns (uint256)
	{
		// Add 1 to account for rounding (can't buy ETHtx for 0 wei)
		return _ethtxToEth(gasPrice(), amountETHtxOut).add(1);
	}

	function ethFromEthtxAtRedemption(uint256 amountETHtxIn)
		public
		view
		virtual
		override
		returns (uint256)
	{
		// Account for fee
		uint256 fee =
			IFeeLogic(feeLogic()).getFee(_msgSender(), address(this), amountETHtxIn);

		return _ethtxToEth(gasPriceAtRedemption(), amountETHtxIn.sub(fee));
	}

	function ethtx() public view override returns (address) {
		return _ethtx;
	}

	function ethtxFromEth(uint256 amountETHIn)
		public
		view
		virtual
		override
		returns (uint256)
	{
		return _ethToEthtx(gasPrice(), amountETHIn);
	}

	function ethtxForEthAtRedemption(uint256 amountETHOut)
		public
		view
		virtual
		override
		returns (uint256)
	{
		uint256 amountETHtx = _ethToEthtx(gasPriceAtRedemption(), amountETHOut);

		// Account for fee
		uint256 amountBeforeFee =
			IFeeLogic(feeLogic()).undoFee(_msgSender(), address(this), amountETHtx);

		return amountBeforeFee;
	}

	function ethSupply() public view virtual override returns (uint256) {
		return IERC20(weth()).balanceOf(address(this));
	}

	function ethtxAvailable() public view virtual override returns (uint256) {
		return IERC20(ethtx()).balanceOf(address(this));
	}

	function ethtxOutstanding() public view virtual override returns (uint256) {
		return IERC20(ethtx()).totalSupply().sub(ethtxAvailable());
	}

	function feeLogic() public view override returns (address) {
		return IERC20TxFee(ethtx()).feeLogic();
	}

	function gasOracle() public view override returns (address) {
		return _gasOracle;
	}

	function gasPrice() public view virtual override returns (uint256) {
		return IGasPrice(gasOracle()).gasPrice();
	}

	function gasPriceAtRedemption()
		public
		view
		virtual
		override
		returns (uint256)
	{
		// Apply cap when collateral below target
		uint256 gasPrice_ = gasPrice();
		uint256 maxGasPrice_ = maxGasPrice();
		if (gasPrice_ > maxGasPrice_) {
			gasPrice_ = maxGasPrice_;
		}
		return gasPrice_;
	}

	function maxGasPrice() public view virtual override returns (uint256) {
		uint256 liability = ethtxOutstanding();
		if (liability == 0) {
			return gasPrice();
		}

		(uint128 targetNum, uint128 targetDen) = targetCRatio();

		uint256 numerator = ethSupply().mul(1e18).mul(targetDen);
		uint256 denominator = liability.mul(gasPerETHtx()).mul(targetNum);
		return numerator.div(denominator);
	}

	function targetCRatio()
		public
		view
		virtual
		override
		returns (uint128 numerator, uint128 denominator)
	{
		numerator = _targetCRatioNum;
		denominator = _targetCRatioDen;
	}

	function weth() public view override returns (address) {
		return _weth;
	}

	/* Internal Pure */

	function _ethtxToEth(uint256 gasPrice_, uint256 amountETHtx)
		internal
		pure
		virtual
		returns (uint256)
	{
		return gasPrice_.mul(amountETHtx).mul(gasPerETHtx()).div(1e18);
	}

	function _ethToEthtx(uint256 gasPrice_, uint256 amountETH)
		internal
		pure
		virtual
		returns (uint256)
	{
		require(gasPrice_ != 0, "ETHtxAMM: gasPrice is zero");
		uint256 numerator = amountETH.mul(1e18);
		uint256 denominator = gasPrice_.mul(gasPerETHtx());
		return numerator.div(denominator);
	}

	/* Internal Mutators */

	function _buy(
		address account,
		uint256 amountIn,
		uint256 amountOut,
		bool useWETH
	) internal virtual {
		uint256 availableSupply = IERC20(ethtx()).balanceOf(address(this));
		require(availableSupply >= amountOut, "ETHtxAMM: not enough ETHtx to buy");

		if (useWETH) {
			IERC20(weth()).safeTransferFrom(account, address(this), amountIn);
		} else {
			IWETH(weth()).deposit{ value: amountIn }();
		}

		// Bypass fee when buying by setting exemption for AMM contract
		IERC20(ethtx()).safeTransfer(account, amountOut);
	}

	function _redeem(
		address account,
		uint256 amountIn,
		uint256 amountOut
	) internal virtual {
		// Apply fee
		IERC20(ethtx()).safeTransferFrom(account, address(this), amountIn);

		IERC20(weth()).safeTransfer(account, amountOut);
	}
}
