// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../exchanges/interfaces/IETHtxAMM.sol";
import "./interfaces/IETHtxRewardsManager.sol";
import "./interfaces/IETHmxRewards.sol";
import "./interfaces/ILPRewards.sol";
import "./RewardsManager.sol";

contract ETHtxRewardsManager is RewardsManager, IETHtxRewardsManager {
	using EnumerableSet for EnumerableSet.AddressSet;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	/* Mutable Private State */

	address private _ethmxRewards;
	address private _ethtx;
	address private _ethtxAMM;
	address private _lpRewards;

	/* Constructor */

	constructor(
		address owner_,
		address defaultRecipient_,
		address rewardsToken_
	) RewardsManager(defaultRecipient_, rewardsToken_) {
		if (owner_ != owner()) {
			transferOwnership(owner_);
		}
	}

	/* External Mutators */

	function convertETHtx() public override {
		IERC20 ethtxHandle = IERC20(ethtx());
		uint256 amount = ethtxHandle.balanceOf(address(this));
		if (amount == 0) {
			return;
		}

		address ethtxAMM_ = ethtxAMM(); // Gas savings
		ethtxHandle.safeIncreaseAllowance(ethtxAMM_, amount);

		// solhint-disable-next-line not-rely-on-time
		uint256 deadline = block.timestamp + 3600;
		IETHtxAMM(ethtxAMM_).redeem(amount, deadline);
	}

	function distributeRewards() external override returns (uint256) {
		convertETHtx();
		uint256 rewards = sendRewards();
		if (rewards != 0) {
			notifyRecipients();
		}
		return rewards;
	}

	function notifyRecipients() public override {
		_notifyEthmxRewards();
		_notifyLpRewards();
	}

	function sendRewards() public override returns (uint256) {
		uint256 rewards = _currentRewardsBalance();
		if (rewards == 0) {
			return 0;
		}

		uint256 totalShares_ = totalShares();

		for (uint256 i = 0; i < _recipients.length(); i++) {
			_sendTo(_recipients.at(i), totalShares_, rewards);
		}

		_totalRewardsRedeemed += rewards;
		return rewards;
	}

	function setEthmxRewardsAddress(address addr) public override onlyOwner {
		_ethmxRewards = addr;
		emit EthmxRewardsAddressSet(_msgSender(), addr);
	}

	function setEthtxAddress(address addr) public override onlyOwner {
		_ethtx = addr;
		emit EthtxAddressSet(_msgSender(), addr);
	}

	function setEthtxAMMAddress(address addr) public override onlyOwner {
		_ethtxAMM = addr;
		emit EthtxAMMAddressSet(_msgSender(), addr);
	}

	function setLPRewardsAddress(address addr) public override onlyOwner {
		_lpRewards = addr;
		emit LPRewardsAddressSet(_msgSender(), addr);
	}

	/* Public Views */

	function ethmxRewards() public view override returns (address) {
		return _ethmxRewards;
	}

	function ethtx() public view override returns (address) {
		return _ethtx;
	}

	function ethtxAMM() public view override returns (address) {
		return _ethtxAMM;
	}

	function lpRewards() public view override returns (address) {
		return _lpRewards;
	}

	/* Internal Mutators */

	function _notifyEthmxRewards() internal {
		IETHmxRewards ethmxRewardsHandle = IETHmxRewards(ethmxRewards());
		if (ethmxRewardsHandle.readyForUpdate()) {
			ethmxRewardsHandle.updateAccrual();
		}
	}

	function _notifyLpRewards() internal {
		ILPRewards(lpRewards()).updateAccrual();
	}

	function _sendTo(
		address account,
		uint256 totalShares_,
		uint256 totalRewards
	) internal {
		Shares storage s = _shares[account];
		uint256 amount = totalRewards.mul(s.active).div(totalShares_);

		IERC20(rewardsToken).safeTransfer(account, amount);
	}
}
