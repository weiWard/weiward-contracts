// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RewardsManagerData.sol";
import "../interfaces/IRewardsManager.sol";
import "../../access/OwnableUpgradeable.sol";

contract RewardsManager is
	Initializable,
	ContextUpgradeable,
	OwnableUpgradeable,
	RewardsManagerData,
	IRewardsManager
{
	using EnumerableSet for EnumerableSet.AddressSet;
	using SafeCast for uint256;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;
	using SafeMath for uint128;

	struct RewardsManagerArgs {
		address defaultRecipient;
		address rewardsToken;
	}

	/* Constructor */

	constructor(address owner_) {
		init(owner_);
	}

	/* Initializers */

	function init(address owner_) public virtual initializer {
		__Context_init_unchained();
		__Ownable_init_unchained(owner_);
	}

	function postInit(RewardsManagerArgs memory _args)
		external
		virtual
		onlyOwner
	{
		address sender = _msgSender();

		_rewardsToken = _args.rewardsToken;
		emit RewardsTokenSet(sender, _args.rewardsToken);

		setDefaultRecipient(_args.defaultRecipient);
	}

	/* External Views */

	function defaultRecipient()
		external
		view
		virtual
		override
		returns (address)
	{
		return _defaultRecipient;
	}

	function rewardsToken() public view virtual override returns (address) {
		return _rewardsToken;
	}

	function sharesFor(address account)
		external
		view
		virtual
		override
		returns (uint128 active, uint128 total)
	{
		Shares storage s = _shares[account];
		return (s.active, s.total);
	}

	function totalRewardsAccrued()
		external
		view
		virtual
		override
		returns (uint256)
	{
		// Overflow is OK
		return _currentRewardsBalance() + _totalRewardsRedeemed;
	}

	function totalRewardsRedeemed()
		external
		view
		virtual
		override
		returns (uint256)
	{
		return _totalRewardsRedeemed;
	}

	function totalShares() public view virtual override returns (uint256 total) {
		for (uint256 i = 0; i < _recipients.length(); i++) {
			total += _shares[_recipients.at(i)].total;
		}
	}

	/* External Mutators */

	function activateShares() external virtual override {
		_activate(_msgSender());
	}

	function activateSharesFor(address account)
		external
		virtual
		override
		onlyOwner
	{
		_activate(account);
	}

	function addShares(address account, uint128 amount)
		external
		virtual
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

	function deactivateShares() external virtual override {
		_deactivate(_msgSender());
	}

	function deactivateSharesFor(address account)
		external
		virtual
		override
		onlyOwner
	{
		_deactivate(account);
	}

	function recoverUnsupportedERC20(
		address token,
		address to,
		uint256 amount
	) external virtual override onlyOwner {
		require(
			token != _rewardsToken,
			"RewardsManager: cannot recover rewards token"
		);
		IERC20(token).safeTransfer(to, amount);
		emit RecoveredUnsupported(_msgSender(), token, to, amount);
	}

	function removeShares(address account, uint128 amount)
		external
		virtual
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

	function setDefaultRecipient(address account)
		public
		virtual
		override
		onlyOwner
	{
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

	function setRewardsToken(address token) public virtual override onlyOwner {
		_rewardsToken = token;
		emit RewardsTokenSet(_msgSender(), token);
	}

	function setShares(
		address account,
		uint128 value,
		bool isActive
	) public virtual override onlyOwner {
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

	function setSharesBatch(
		address[] calldata accounts,
		uint128[] calldata values,
		bool[] calldata isActives
	) public virtual override onlyOwner {
		uint256 length = accounts.length;
		require(length != 0, "RewardsManager: no accounts specified");
		require(length == values.length, "RewardsManager: values length mismatch");
		require(
			length == isActives.length,
			"RewardsManager: isActives length mismatch"
		);

		for (uint256 i = 0; i < length; i++) {
			setShares(accounts[i], values[i], isActives[i]);
		}
	}

	/* Internal Views */

	function _currentRewardsBalance() internal view virtual returns (uint256) {
		return IERC20(_rewardsToken).balanceOf(address(this));
	}

	/* Internal Mutators */

	function _activate(address account) internal virtual {
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

	function _deactivate(address account) internal virtual {
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
