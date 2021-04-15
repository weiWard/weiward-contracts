// SPDX-License-Identifier: MIT
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

	struct ETHmxMinterArgs {
		address ethmx;
		address ethtx;
		address ethtxAMM;
		address weth;
		uint256 mintGasPrice;
		uint128 roiNumerator;
		uint128 roiDenominator;
		uint256 earlyThreshold;
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
		uint256 amountETHIn = ammHandle.ethForEthtx(amount);
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
		return amountETHIn;
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
		uint256 ethToLp = IETHtxAMM(ethtxAMM()).ethForEthtx(ethtxToLp);
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
