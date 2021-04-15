// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "./ETHtxRewardsManagerData.sol";
import "../../exchanges/interfaces/IETHtxAMM.sol";
import "../interfaces/IETHtxRewardsManager.sol";
import "../interfaces/IETHmxRewards.sol";
import "../interfaces/ILPRewards.sol";
import "../../access/OwnableUpgradeable.sol";
import "../RewardsManager/RewardsManager.sol";

contract ETHtxRewardsManager is
	Initializable,
	ContextUpgradeable,
	OwnableUpgradeable,
	RewardsManager,
	ETHtxRewardsManagerData,
	IETHtxRewardsManager
{
	using EnumerableSet for EnumerableSet.AddressSet;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	struct ETHtxRewardsManagerArgs {
		address defaultRecipient;
		address rewardsToken;
		address ethmxRewards;
		address ethtx;
		address ethtxAMM;
		address lpRewards;
	}

	/* Constructor */

	constructor(address owner_) RewardsManager(owner_) {
		return;
	}

	/* Initializer */

	// init inherited from RewardsManager

	function ethtxRewardsManagerPostInit(ETHtxRewardsManagerArgs memory _args)
		external
		virtual
		onlyOwner
	{
		address sender = _msgSender();

		_rewardsToken = _args.rewardsToken;
		emit RewardsTokenSet(sender, _args.rewardsToken);

		setDefaultRecipient(_args.defaultRecipient);

		_ethmxRewards = _args.ethmxRewards;
		emit EthmxRewardsSet(sender, _args.ethmxRewards);

		_ethtx = _args.ethtx;
		emit EthtxSet(sender, _args.ethtx);

		_ethtxAMM = _args.ethtxAMM;
		emit EthtxAMMSet(sender, _args.ethtxAMM);

		_lpRewards = _args.lpRewards;
		emit LPRewardsSet(sender, _args.lpRewards);
	}

	/* External Mutators */

	function convertETHtx() public virtual override {
		IERC20 ethtxHandle = IERC20(ethtx());
		uint256 amount = ethtxHandle.balanceOf(address(this));
		if (amount == 0) {
			return;
		}

		address ethtxAMM_ = ethtxAMM(); // Gas savings
		ethtxHandle.safeIncreaseAllowance(ethtxAMM_, amount);

		// solhint-disable-next-line not-rely-on-time
		IETHtxAMM(ethtxAMM_).swapEthtxForWeth(amount, block.timestamp);
	}

	function distributeRewards() external virtual override returns (uint256) {
		convertETHtx();
		uint256 rewards = sendRewards();
		if (rewards != 0) {
			notifyRecipients();
		}
		return rewards;
	}

	function notifyRecipients() public virtual override {
		_notifyEthmxRewards();
		_notifyLpRewards();
	}

	function sendRewards() public virtual override returns (uint256) {
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

	function setEthmxRewards(address account) public virtual override onlyOwner {
		_ethmxRewards = account;
		emit EthmxRewardsSet(_msgSender(), account);
	}

	function setEthtx(address account) public virtual override onlyOwner {
		_ethtx = account;
		emit EthtxSet(_msgSender(), account);
	}

	function setEthtxAMM(address account) public virtual override onlyOwner {
		_ethtxAMM = account;
		emit EthtxAMMSet(_msgSender(), account);
	}

	function setLPRewards(address account) public virtual override onlyOwner {
		_lpRewards = account;
		emit LPRewardsSet(_msgSender(), account);
	}

	/* Public Views */

	function ethmxRewards() public view virtual override returns (address) {
		return _ethmxRewards;
	}

	function ethtx() public view virtual override returns (address) {
		return _ethtx;
	}

	function ethtxAMM() public view virtual override returns (address) {
		return _ethtxAMM;
	}

	function lpRewards() public view virtual override returns (address) {
		return _lpRewards;
	}

	/* Internal Mutators */

	function _notifyEthmxRewards() internal virtual {
		IETHmxRewards ethmxRewardsHandle = IETHmxRewards(ethmxRewards());
		if (ethmxRewardsHandle.readyForUpdate()) {
			ethmxRewardsHandle.updateAccrual();
		}
	}

	function _notifyLpRewards() internal virtual {
		ILPRewards(lpRewards()).updateAccrual();
	}

	function _sendTo(
		address account,
		uint256 totalShares_,
		uint256 totalRewards
	) internal virtual {
		Shares storage s = _shares[account];
		uint256 amount = totalRewards.mul(s.active).div(totalShares_);

		IERC20(_rewardsToken).safeTransfer(account, amount);
	}
}
