// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IRewardsManager.sol";

contract RewardsManager is Ownable, IRewardsManager {
	using EnumerableSet for EnumerableSet.AddressSet;
	using SafeCast for uint256;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;
	using SafeMath for uint128;

	/* Types */

	struct Shares {
		uint128 active;
		uint128 total;
	}

	/* Mutable Internal State */

	address internal _rewardsToken;
	address internal _defaultRecipient;
	uint256 internal _totalRewardsRedeemed;
	EnumerableSet.AddressSet internal _recipients;
	mapping(address => Shares) internal _shares;

	/* Constructor */

	constructor(address defaultRecipient_, address rewardsToken_) Ownable() {
		setRewardsToken(rewardsToken_);
		setDefaultRecipient(defaultRecipient_);
	}

	/* External Views */

	function defaultRecipient() external view override returns (address) {
		return _defaultRecipient;
	}

	function rewardsToken() public view override returns (address) {
		return _rewardsToken;
	}

	function sharesFor(address account)
		external
		view
		override
		returns (uint128 active, uint128 total)
	{
		Shares storage s = _shares[account];
		return (s.active, s.total);
	}

	function totalRewardsAccrued() external view override returns (uint256) {
		// Overflow is OK
		return _currentRewardsBalance() + _totalRewardsRedeemed;
	}

	function totalRewardsRedeemed() external view override returns (uint256) {
		return _totalRewardsRedeemed;
	}

	function totalShares() public view override returns (uint256 total) {
		for (uint256 i = 0; i < _recipients.length(); i++) {
			total += _shares[_recipients.at(i)].total;
		}
	}

	/* External Mutators */

	function activateShares() external override {
		_activate(_msgSender());
	}

	function activateSharesFor(address account) external override onlyOwner {
		_activate(account);
	}

	function addShares(address account, uint128 amount)
		external
		override
		onlyOwner
	{
		require(
			account != address(0),
			"RewardsManager: cannot add shares to zero address"
		);
		require(
			account != address(this),
			"RewardsManager: cannot add shares to this contract address"
		);
		require(amount != 0, "RewardsManager: cannot add zero shares");

		Shares storage s = _shares[account];
		if (s.active == 0) {
			// Add to inactive value
			Shares storage d = _shares[_defaultRecipient];
			d.active = d.active.add(amount).toUint128();
		} else {
			s.active = s.active.add(amount).toUint128();
		}
		s.total = s.total.add(amount).toUint128();
		_recipients.add(account);
		emit SharesAdded(_msgSender(), account, amount);
	}

	function deactivateShares() external override {
		_deactivate(_msgSender());
	}

	function deactivateSharesFor(address account) external override onlyOwner {
		_deactivate(account);
	}

	function recoverUnsupportedERC20(
		address token,
		address to,
		uint256 amount
	) external override onlyOwner {
		require(
			token != _rewardsToken,
			"RewardsManager: cannot recover rewards token"
		);
		IERC20(token).safeTransfer(to, amount);
		emit RecoveredUnsupported(_msgSender(), token, to, amount);
	}

	function removeShares(address account, uint128 amount)
		external
		override
		onlyOwner
	{
		require(amount != 0, "RewardsManager: cannot remove zero shares");

		Shares storage s = _shares[account];
		if (s.active == 0) {
			// Remove from inactive value
			Shares storage d = _shares[_defaultRecipient];
			d.active = d.active.sub(amount).toUint128();
		} else {
			s.active = s.active.sub(amount).toUint128();
		}
		s.total = s.total.sub(amount).toUint128();
		if (s.total == 0) {
			_recipients.remove(account);
		}
		emit SharesRemoved(_msgSender(), account, amount);
	}

	function setDefaultRecipient(address account) public override onlyOwner {
		require(
			account != address(0),
			"RewardsManager: cannot set to zero address"
		);
		require(
			account != address(this),
			"RewardsManager: cannot set to this contract"
		);

		// Activate
		_activate(account);

		// Move any inactive shares
		Shares storage original = _shares[_defaultRecipient];
		if (original.active > original.total) {
			uint128 inactive = original.active - original.total;
			original.active -= inactive;

			Shares storage next = _shares[account];
			next.active = next.active.add(inactive).toUint128();
		}

		if (original.total == 0) {
			_recipients.remove(_defaultRecipient);
		}
		_defaultRecipient = account;
		_recipients.add(account);
		emit DefaultRecipientSet(_msgSender(), account);
	}

	function setRewardsToken(address token) public override onlyOwner {
		_rewardsToken = token;
		emit RewardsTokenSet(_msgSender(), token);
	}

	function setShares(
		address account,
		uint128 value,
		bool isActive
	) external override onlyOwner {
		require(
			account != address(0),
			"RewardsManager: cannot set shares for zero address"
		);
		require(
			account != address(this),
			"RewardsManager: cannot set shares for this contract address"
		);

		// Gas savings
		address defaultRecipient_ = _defaultRecipient;
		Shares storage d = _shares[defaultRecipient_];

		if (account == defaultRecipient_) {
			d.active = d.active.sub(d.total).add(value).toUint128();
			d.total = value;
			emit SharesSet(_msgSender(), account, value, isActive);
			return;
		}

		Shares storage s = _shares[account];

		if (s.total != 0 && s.active == 0) {
			// Subtract old inactive value
			d.active = d.active.sub(s.total).toUint128();
		}

		if (!isActive) {
			s.active = 0;
			// Add new inactive value
			d.active = d.active.add(value).toUint128();
		} else {
			s.active = value;
		}

		s.total = value;
		if (value != 0) {
			_recipients.add(account);
		} else {
			_recipients.remove(account);
		}
		emit SharesSet(_msgSender(), account, value, isActive);
	}

	/* Internal Views */

	function _currentRewardsBalance() internal view returns (uint256) {
		return IERC20(_rewardsToken).balanceOf(address(this));
	}

	/* Internal Mutators */

	function _activate(address account) internal {
		Shares storage s = _shares[account];

		// Do nothing if already active
		if (s.total == 0 || s.active > 0) {
			return;
		}

		Shares storage d = _shares[_defaultRecipient];

		s.active = s.total;
		d.active = d.active.sub(s.total).toUint128();
		emit SharesActivated(_msgSender(), account);
	}

	function _deactivate(address account) internal {
		// Skip for the default recipient
		if (account == _defaultRecipient) {
			return;
		}

		Shares storage s = _shares[account];

		// Do nothing if already deactivated
		if (s.active == 0) {
			return;
		}

		Shares storage d = _shares[_defaultRecipient];

		s.active = 0;
		d.active = d.active.add(s.total).toUint128();
		emit SharesDeactivated(_msgSender(), account);
	}
}
