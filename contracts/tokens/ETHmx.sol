// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./ERC20.sol";
import "./interfaces/IETHmx.sol";
import "./interfaces/IETHtx.sol";
import "./interfaces/IWETH.sol";

contract ETHmx is Ownable, Pausable, ERC20, IETHmx {
	using Address for address;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	/* Immutable Public State */

	uint256 public immutable override earlyThreshold;
	address public immutable override wethAddr;

	/* Mutable Public State */

	address public override ethtxAddr;
	uint256 public override mintGasPrice;
	uint256 public override totalGiven;

	/* Mutable Internal State */

	uint128 internal _roiNum;
	uint128 internal _roiDen;

	/* Constructor */

	constructor(
		address ethtxAddr_,
		address wethAddr_,
		uint256 mintGasPrice_,
		uint128 roiNumerator,
		uint128 roiDenominator,
		uint256 earlyThreshold_
	) Ownable() ERC20("ETHtx Minter Token", "ETHmx", 18) {
		wethAddr = wethAddr_;
		setEthtxAddress(ethtxAddr_);
		setMintGasPrice(mintGasPrice_);
		setRoi(roiNumerator, roiDenominator);
		earlyThreshold = earlyThreshold_;
	}

	/* External Views */

	function roi() external view override returns (uint128, uint128) {
		return (_roiNum, _roiDen);
	}

	/* External Mutators */

	function burn(uint256 amount) external override {
		_burn(_msgSender(), amount);
	}

	function mint() external payable override whenNotPaused {
		uint256 amountIn = msg.value;

		IWETH(wethAddr).deposit{ value: amountIn }();
		IERC20(wethAddr).safeTransfer(ethtxAddr, amountIn);
		IETHtx(ethtxAddr).mint(ethtxAddr, ethtxFromEth(amountIn));

		uint256 amountOut = ethmxFromEth(amountIn);
		_mint(_msgSender(), amountOut);
		totalGiven += amountIn;
	}

	function mintWithETHtx(uint256 amount) external override whenNotPaused {
		require(
			IETHtx(ethtxAddr).cRatioBelowTarget(),
			"ETHmx: can only burn ETHtx if undercollateralized"
		);

		address account = _msgSender();

		IETHtx(ethtxAddr).burn(account, amount);

		uint256 amountOut = ethmxFromEthtx(amount);
		_mint(account, amountOut);
	}

	function mintWithWETH(uint256 amount) external override whenNotPaused {
		address account = _msgSender();

		IERC20(wethAddr).safeTransferFrom(account, ethtxAddr, amount);
		IETHtx(ethtxAddr).mint(ethtxAddr, ethtxFromEth(amount));

		uint256 amountOut = ethmxFromEth(amount);
		_mint(account, amountOut);
		totalGiven += amount;
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
		ethtxAddr = addr;
		emit EthtxAddressSet(_msgSender(), addr);
	}

	function setMintGasPrice(uint256 value) public override onlyOwner {
		mintGasPrice = value;
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

	function ethmxFromEth(uint256 amountETHIn)
		public
		view
		override
		returns (uint256)
	{
		// Gas savings
		uint256 totalGiven_ = totalGiven;
		uint256 earlyThreshold_ = earlyThreshold;

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
		uint256 amountETHIn = IETHtx(ethtxAddr).ethForEthtx(amountETHtxIn);
		return _ethmxFromEth(amountETHIn);
	}

	function ethtxFromEth(uint256 amountETHIn)
		public
		view
		override
		returns (uint256)
	{
		uint256 numerator = amountETHIn.mul(1e18);
		uint256 denominator = mintGasPrice.mul(IETHtx(ethtxAddr).gasPerETHtx());
		return numerator.div(denominator);
	}

	/* Internal Views */

	function _ethmxFromEth(uint256 amountETHIn) internal view returns (uint256) {
		return amountETHIn.mul(_roiNum).div(_roiDen);
	}
}
