// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../tokens/interfaces/IETHmx.sol";
import "../exchanges/interfaces/IETHmxMinter.sol";
import "../tokens/interfaces/IETHtx.sol";
import "../exchanges/interfaces/IETHtxAMM.sol";
import "../tokens/interfaces/IWETH.sol";

contract ETHmxMinter is Ownable, Pausable, IETHmxMinter {
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	/* Mutable Internal State */

	address internal _ethtx;
	address internal _ethtxAMM;
	uint256 internal _mintGasPrice;
	uint256 internal _totalGiven;
	uint128 internal _roiNum;
	uint128 internal _roiDen;

	/* Immutable Private State */

	uint256 private immutable _earlyThreshold;
	address private immutable _ethmx;
	address private immutable _weth;

	/* Constructor */

	constructor(
		address owner_,
		address ethmx_,
		address ethtx_,
		address ethtxAMM_,
		address wethAddr_,
		uint256 mintGasPrice_,
		uint128 roiNumerator,
		uint128 roiDenominator,
		uint256 earlyThreshold_
	) Ownable() {
		setEthtxAddress(ethtx_);
		setEthtxAMMAddress(ethtxAMM_);
		setMintGasPrice(mintGasPrice_);
		setRoi(roiNumerator, roiDenominator);
		_earlyThreshold = earlyThreshold_;
		_ethmx = ethmx_;
		_weth = wethAddr_;
		if (owner_ != owner()) {
			transferOwnership(owner_);
		}
	}

	function mint() external payable override whenNotPaused {
		uint256 amountIn = msg.value;

		IWETH(weth()).deposit{ value: amountIn }();
		IERC20(weth()).safeTransfer(ethtxAMM(), amountIn);
		IETHtx(ethtx()).mint(ethtxAMM(), ethtxFromEth(amountIn));

		uint256 amountOut = ethmxFromEth(amountIn);
		_mint(_msgSender(), amountOut);
		_totalGiven += amountIn;
	}

	function mintWithETHtx(uint256 amount) external override whenNotPaused {
		require(
			IETHtxAMM(ethtxAMM()).cRatioBelowTarget(),
			"ETHmxMinter: can only burn ETHtx if undercollateralized"
		);

		address account = _msgSender();

		IETHtx(ethtx()).burn(account, amount);

		uint256 amountOut = ethmxFromEthtx(amount);
		_mint(account, amountOut);
	}

	function mintWithWETH(uint256 amount) external override whenNotPaused {
		address account = _msgSender();

		IERC20(weth()).safeTransferFrom(account, ethtxAMM(), amount);
		IETHtx(ethtx()).mint(ethtxAMM(), ethtxFromEth(amount));

		uint256 amountOut = ethmxFromEth(amount);
		_mint(account, amountOut);
		_totalGiven += amount;
	}

	function pause() external override onlyOwner {
		_pause();
	}

	function recoverERC20(
		address token,
		address to,
		uint256 amount
	) external override onlyOwner {
		IERC20(token).safeTransfer(to, amount);
		emit Recovered(_msgSender(), token, to, amount);
	}

	function setEthtxAddress(address addr) public override onlyOwner {
		_ethtx = addr;
		emit EthtxAddressSet(_msgSender(), addr);
	}

	function setEthtxAMMAddress(address addr) public override onlyOwner {
		_ethtxAMM = addr;
		emit EthtxAMMAddressSet(_msgSender(), addr);
	}

	function setMintGasPrice(uint256 value) public override onlyOwner {
		_mintGasPrice = value;
		emit MintGasPriceSet(_msgSender(), value);
	}

	function setRoi(uint128 numerator, uint128 denominator)
		public
		override
		onlyOwner
	{
		_roiNum = numerator;
		_roiDen = denominator;
		emit RoiSet(_msgSender(), numerator, denominator);
	}

	function unpause() external override onlyOwner {
		_unpause();
	}

	/* Public Views */

	function earlyThreshold() public view override returns (uint256) {
		return _earlyThreshold;
	}

	function ethmx() public view override returns (address) {
		return _ethmx;
	}

	function ethmxFromEth(uint256 amountETHIn)
		public
		view
		override
		returns (uint256)
	{
		// Gas savings
		uint256 totalGiven_ = totalGiven();
		uint256 earlyThreshold_ = earlyThreshold();

		// Check for early-bird rewards (will repeat after ~1e59 ETH given)
		if (totalGiven_ < earlyThreshold_) {
			uint256 currentLeft = earlyThreshold_ - totalGiven_;
			if (amountETHIn < currentLeft) {
				amountETHIn = (2 *
					amountETHIn -
					(2 * totalGiven_ * amountETHIn + amountETHIn**2) /
					(2 * earlyThreshold_));
			} else {
				amountETHIn += (currentLeft * currentLeft) / (2 * earlyThreshold_);
			}
		}

		return _ethmxFromEth(amountETHIn);
	}

	function ethmxFromEthtx(uint256 amountETHtxIn)
		public
		view
		override
		returns (uint256)
	{
		uint256 amountETHIn = IETHtxAMM(ethtxAMM()).ethForEthtx(amountETHtxIn);
		return _ethmxFromEth(amountETHIn);
	}

	function ethtx() public view override returns (address) {
		return _ethtx;
	}

	function ethtxAMM() public view override returns (address) {
		return _ethtxAMM;
	}

	function ethtxFromEth(uint256 amountETHIn)
		public
		view
		override
		returns (uint256)
	{
		uint256 numerator = amountETHIn.mul(1e18);
		uint256 denominator =
			mintGasPrice().mul(IETHtxAMM(ethtxAMM()).gasPerETHtx());
		return numerator.div(denominator);
	}

	function mintGasPrice() public view override returns (uint256) {
		return _mintGasPrice;
	}

	function roi() public view override returns (uint128, uint128) {
		return (_roiNum, _roiDen);
	}

	function totalGiven() public view override returns (uint256) {
		return _totalGiven;
	}

	function weth() public view override returns (address) {
		return _weth;
	}

	/* Internal Views */

	function _ethmxFromEth(uint256 amountETHIn) internal view returns (uint256) {
		(uint128 roiNum, uint128 roiDen) = roi();
		return amountETHIn.mul(roiNum).div(roiDen);
	}

	/* Internal Mutators */

	function _mint(address account, uint256 amount) internal {
		IETHmx(ethmx()).mintTo(account, amount);
	}
}
