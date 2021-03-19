// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../tokens/interfaces/IETHtx.sol";
import "./interfaces/IETHtxRewardsManager.sol";
import "./interfaces/IETHmxRewards.sol";
import "./interfaces/ILPRewards.sol";
import "./RewardsManager.sol";

contract ETHtxRewardsManager is RewardsManager, IETHtxRewardsManager {
	using EnumerableSet for EnumerableSet.AddressSet;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	/* Mutable Public State */

	address public override ethmxRewardsAddr;
	address public override ethtxAddr;
	address public override lpRewardsAddr;

	/* Constructor */

	constructor(address defaultRecipient_, address rewardsToken_)
		RewardsManager(defaultRecipient_, rewardsToken_)
	{
		return;
	}

	/* External Mutators */

	function convertETHtx() public override {
		uint256 amount = IERC20(ethtxAddr).balanceOf(address(this));
		if (amount == 0) {
			return;
		}
		// solhint-disable-next-line not-rely-on-time
		uint256 deadline = block.timestamp + 3600;
		IETHtx(ethtxAddr).redeem(amount, deadline);
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
		ethmxRewardsAddr = addr;
		emit EthmxRewardsAddressSet(_msgSender(), addr);
	}

	function setEthtxAddress(address addr) public override onlyOwner {
		ethtxAddr = addr;
		emit EthtxAddressSet(_msgSender(), addr);
	}

	function setLPRewardsAddress(address addr) public override onlyOwner {
		lpRewardsAddr = addr;
		emit LPRewardsAddressSet(_msgSender(), addr);
	}

	/* Internal Mutators */

	function _notifyEthmxRewards() internal {
		IETHmxRewards ethmxRewardsHandle = IETHmxRewards(ethmxRewardsAddr);
		if (ethmxRewardsHandle.readyForUpdate()) {
			ethmxRewardsHandle.updateAccrual();
		}
	}

	function _notifyLpRewards() internal {
		ILPRewards(lpRewardsAddr).updateAccrual();
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
