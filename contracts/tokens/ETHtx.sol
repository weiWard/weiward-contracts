// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./ERC20TxFee.sol";
import "./interfaces/IETHtx.sol";
import "./interfaces/IWETH.sol";

// TODO replace after writing oracle
interface IGasPriceOracle {
	function gasPrice() external view returns (uint256);
}

contract ETHtx is Ownable, Pausable, ERC20TxFee, IETHtx {
	using Address for address payable;
	using SafeERC20 for IERC20;
	using SafeMath for uint128;
	using SafeMath for uint256;

	/* Immutable Public State */

	address public immutable wethAddr;

	/* Mutable Internal State */

	address internal _gasOracle;
	address internal _minter;
	uint128 internal _targetCRatioNum;
	uint128 internal _targetCRatioDen;

	/* Constructor */

	constructor(
		address feeLogic_,
		address gasOracle_,
		address minter_,
		address wethAddr_,
		uint128 targetCRatioNumerator,
		uint128 targetCRatioDenominator
	) Ownable() ERC20TxFee("Ethereum Transaction", "ETHtx", 18, feeLogic_) {
		setGasOracle(gasOracle_);
		setMinter(minter_);
		setTargetCRatio(targetCRatioNumerator, targetCRatioDenominator);
		wethAddr = wethAddr_;
	}

	/* Modifiers */

	modifier ensure(uint256 deadline) {
		// solhint-disable-next-line not-rely-on-time
		require(deadline >= block.timestamp, "ETHtx: expired");
		_;
	}

	modifier onlyMinter {
		require(_msgSender() == _minter, "ETHtx: caller is not the minter");
		_;
	}

	/* Fallbacks */

	receive() external payable {
		// Only accept random ETH if we can convert it to WETH
		IWETH(wethAddr).deposit{ value: msg.value }();
	}

	/* External Views */

	function gasOracle() external view override returns (address) {
		return _gasOracle;
	}

	/* External Mutators */

	function burn(address account, uint256 amount)
		external
		virtual
		override
		onlyMinter
		whenNotPaused
	{
		_burn(account, amount);
	}

	function buy(uint256 deadline)
		external
		payable
		virtual
		override
		ensure(deadline)
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
	{
		address account = _msgSender();
		uint256 amountIn = ethForEthtx(amountOut);
		require(amountIn <= msg.value, "ETHtx: amountIn exceeds max");
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
	) external virtual override ensure(deadline) {
		uint256 amountIn = ethForEthtx(amountOut);
		require(amountIn <= amountInMax, "ETHtx: amountIn exceeds max");
		_buy(_msgSender(), amountIn, amountOut, true);
	}

	function buyWithExactETH(uint256 amountOutMin, uint256 deadline)
		external
		payable
		virtual
		override
		ensure(deadline)
	{
		uint256 amountIn = msg.value;
		uint256 amountOut = ethtxFromEth(amountIn);
		require(amountOut >= amountOutMin, "ETHtx: amountOut below min");
		_buy(_msgSender(), amountIn, amountOut, false);
	}

	function buyWithExactWETH(
		uint256 amountIn,
		uint256 amountOutMin,
		uint256 deadline
	) external virtual override ensure(deadline) {
		uint256 amountOut = ethtxFromEth(amountIn);
		require(amountOut >= amountOutMin, "ETHtx: amountOut below min");
		_buy(_msgSender(), amountIn, amountOut, true);
	}

	function mint(address account, uint256 amount)
		external
		virtual
		override
		onlyMinter
		whenNotPaused
	{
		_mint(account, amount);
	}

	function pause() external virtual override onlyOwner whenNotPaused {
		_pause();
	}

	function redeem(
		uint256 amountIn,
		bool asWETH,
		uint256 deadline
	) external virtual override ensure(deadline) {
		uint256 amountOut = ethFromEthtxAtRedemption(amountIn);
		_redeem(_msgSender(), amountIn, amountOut, asWETH);
	}

	function redeemExact(
		uint256 amountInMax,
		uint256 amountOut,
		bool asWETH,
		uint256 deadline
	) external virtual override ensure(deadline) {
		uint256 amountIn = ethtxForEthAtRedemption(amountOut);
		require(amountIn <= amountInMax, "ETHtx: amountIn exceeds max");
		_redeem(_msgSender(), amountIn, amountOut, asWETH);
	}

	function redeemWithExact(
		uint256 amountIn,
		uint256 amountOutMin,
		bool asWETH,
		uint256 deadline
	) external virtual override ensure(deadline) {
		uint256 amountOut = ethFromEthtxAtRedemption(amountIn);
		require(amountOut >= amountOutMin, "ETHtx: amountOut below min");
		_redeem(_msgSender(), amountIn, amountOut, asWETH);
	}

	function unpause() external virtual override onlyOwner whenPaused {
		_unpause();
	}

	/* Public Pure */

	function gasPerETHtx() public pure virtual override returns (uint256) {
		// Per 1e18
		return 21000;
	}

	/* Public Views */

	function ethForEthtx(uint256 amountETHtxOut)
		public
		view
		virtual
		override
		returns (uint256)
	{
		return _ethtxToEth(gasPrice(), amountETHtxOut);
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
			IFeeLogic(_feeLogic).getFee(_msgSender(), address(this), amountETHtxIn);

		return _ethtxToEth(gasPriceAtRedemption(), amountETHtxIn.sub(fee));
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
			IFeeLogic(_feeLogic).undoFee(_msgSender(), address(this), amountETHtx);

		return amountBeforeFee;
	}

	function ethSupply() public view virtual override returns (uint256) {
		return IERC20(wethAddr).balanceOf(address(this));
	}

	function ethtxAvailable() public view virtual override returns (uint256) {
		return balanceOf(address(this));
	}

	function ethtxOutstanding() public view virtual override returns (uint256) {
		return totalSupply().sub(ethtxAvailable());
	}

	function gasPrice() public view virtual override returns (uint256) {
		return IGasPriceOracle(_gasOracle).gasPrice();
	}

	function maxGasPrice() public view virtual override returns (uint256) {
		uint256 liability = ethtxOutstanding();
		if (liability == 0) {
			return gasPrice();
		}

		uint256 numerator = ethSupply().mul(1e18).mul(_targetCRatioDen);
		uint256 denominator = liability.mul(gasPerETHtx()).mul(_targetCRatioNum);
		return numerator.div(denominator);
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

	function cRatioBelowTarget() public view virtual override returns (bool) {
		(uint256 cRatioNum, uint256 cRatioDen) = cRatio();
		if (cRatioDen == 0) {
			return false;
		}

		uint256 current = cRatioNum.mul(1e18).div(cRatioDen);

		(uint256 targetNum, uint256 targetDen) = targetCRatio();
		uint256 target = targetNum.mul(1e18).div(targetDen);

		return current < target;
	}

	/* Public Mutators */

	function setFeeLogic(address account) public virtual override onlyOwner {
		require(account != address(0), "ETHtx: feeLogic zero address");
		_feeLogic = account;
		emit FeeLogicSet(account);
	}

	function setGasOracle(address account) public virtual override onlyOwner {
		require(account != address(0), "ETHtx: gasOracle zero address");
		_gasOracle = account;
		emit GasOracleSet(account);
	}

	function setMinter(address account) public virtual override onlyOwner {
		_minter = account;
		emit MinterSet(account);
	}

	function setTargetCRatio(uint128 numerator, uint128 denominator)
		public
		virtual
		override
		onlyOwner
	{
		require(numerator != 0, "ETHtx: targetCRatio numerator is zero");
		require(denominator != 0, "ETHtx: targetCRatio denominator is zero");
		_targetCRatioNum = numerator;
		_targetCRatioDen = denominator;
		emit TargetCRatioSet(numerator, denominator);
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
		require(gasPrice_ != 0, "ETHtx: gasPrice is zero");
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
		uint256 availableSupply = balanceOf(address(this));
		require(availableSupply >= amountOut, "ETHtx: not enough ETHtx to buy");

		if (useWETH) {
			IERC20(wethAddr).safeTransferFrom(account, address(this), amountIn);
		} else {
			IWETH(wethAddr).deposit{ value: amountIn }();
		}

		// Bypass fee when buying
		_beforeTokenTransfer(address(this), account, amountOut);
		// Already checked overflow
		_balances[address(this)] = availableSupply - amountOut;
		_balances[account] = _balances[account].add(amountOut);
		emit Transfer(address(this), account, amountOut);
	}

	function _redeem(
		address payable account,
		uint256 amountIn,
		uint256 amountOut,
		bool asWETH
	) internal virtual {
		// Apply fee
		_transfer(account, address(this), amountIn);

		if (asWETH) {
			IERC20(wethAddr).safeTransfer(account, amountOut);
		} else {
			IWETH(wethAddr).withdraw(amountOut);
			account.sendValue(amountOut);
		}
	}
}
