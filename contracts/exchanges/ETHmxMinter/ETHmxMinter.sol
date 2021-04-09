// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
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

contract ETHmxMinter is
	Initializable,
	ContextUpgradeable,
	OwnableUpgradeable,
	PausableUpgradeable,
	ETHmxMinterData,
	IETHmxMinter
{
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	struct Args {
		address ethmx;
		address ethtx;
		address ethtxAMM;
		address weth;
		uint256 mintGasPrice;
		uint128 roiNumerator;
		uint128 roiDenominator;
		uint256 earlyThreshold;
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

	function postInit(Args memory _args) external virtual onlyOwner {
		address sender = msg.sender;

		// Set early threshold
		_earlyThreshold = _args.earlyThreshold;
		emit EarlyThresholdSet(sender, _args.earlyThreshold);

		_ethmx = _args.ethmx;
		emit EthmxSet(sender, _args.ethmx);

		_ethtx = _args.ethtx;
		emit EthtxSet(sender, _args.ethtx);

		_ethtxAMM = _args.ethtxAMM;
		emit EthtxAMMSet(sender, _args.ethtxAMM);

		_weth = _args.weth;
		emit WethSet(sender, _args.weth);

		_mintGasPrice = _args.mintGasPrice;
		emit MintGasPriceSet(sender, _args.mintGasPrice);

		_roiNum = _args.roiNumerator;
		_roiDen = _args.roiDenominator;
		emit RoiSet(sender, _args.roiNumerator, _args.roiDenominator);
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

	function mintWithETHtx(uint256 amount)
		external
		virtual
		override
		whenNotPaused
	{
		require(
			IETHtxAMM(ethtxAMM()).cRatioBelowTarget(),
			"ETHmxMinter: can only burn ETHtx if undercollateralized"
		);

		address account = _msgSender();

		IETHtx(ethtx()).burn(account, amount);

		uint256 amountOut = ethmxFromEthtx(amount);
		_mint(account, amountOut);
	}

	function mintWithWETH(uint256 amount)
		external
		virtual
		override
		whenNotPaused
	{
		address account = _msgSender();

		IERC20(weth()).safeTransferFrom(account, ethtxAMM(), amount);
		IETHtx(ethtx()).mint(ethtxAMM(), ethtxFromEth(amount));

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

	function setEarlyThreshold(uint256 value) public virtual override onlyOwner {
		_earlyThreshold = value;
		emit EarlyThresholdSet(_msgSender(), value);
	}

	function setEthmx(address addr) public virtual override onlyOwner {
		_ethmx = addr;
		emit EthmxSet(_msgSender(), addr);
	}

	function setEthtx(address addr) public virtual override onlyOwner {
		_ethtx = addr;
		emit EthtxSet(_msgSender(), addr);
	}

	function setEthtxAMM(address addr) public virtual override onlyOwner {
		_ethtxAMM = addr;
		emit EthtxAMMSet(_msgSender(), addr);
	}

	function setMintGasPrice(uint256 value) public virtual override onlyOwner {
		_mintGasPrice = value;
		emit MintGasPriceSet(_msgSender(), value);
	}

	function setRoi(uint128 numerator, uint128 denominator)
		public
		virtual
		override
		onlyOwner
	{
		_roiNum = numerator;
		_roiDen = denominator;
		emit RoiSet(_msgSender(), numerator, denominator);
	}

	function setWeth(address addr) public virtual override onlyOwner {
		_weth = addr;
		emit WethSet(_msgSender(), addr);
	}

	function unpause() external virtual override onlyOwner {
		_unpause();
	}

	/* Public Views */

	function earlyThreshold() public view virtual override returns (uint256) {
		return _earlyThreshold;
	}

	function ethmx() public view virtual override returns (address) {
		return _ethmx;
	}

	function ethmxFromEth(uint256 amountETHIn)
		public
		view
		virtual
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
		virtual
		override
		returns (uint256)
	{
		uint256 amountETHIn = IETHtxAMM(ethtxAMM()).ethForEthtx(amountETHtxIn);
		return _ethmxFromEth(amountETHIn);
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

	function mintGasPrice() public view virtual override returns (uint256) {
		return _mintGasPrice;
	}

	function roi() public view virtual override returns (uint128, uint128) {
		return (_roiNum, _roiDen);
	}

	function totalGiven() public view virtual override returns (uint256) {
		return _totalGiven;
	}

	function weth() public view virtual override returns (address) {
		return _weth;
	}

	/* Internal Views */

	function _ethmxFromEth(uint256 amountETHIn)
		internal
		view
		virtual
		returns (uint256)
	{
		(uint128 roiNum, uint128 roiDen) = roi();
		return amountETHIn.mul(roiNum).div(roiDen);
	}

	/* Internal Mutators */

	function _mint(address account, uint256 amount) internal virtual {
		IETHmx(ethmx()).mintTo(account, amount);
	}
}
