// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IFeeLogic.sol";

contract FeeLogic is IFeeLogic {
	using EnumerableSet for EnumerableSet.AddressSet;
	using SafeMath for uint128;
	using SafeMath for uint256;

	/* Mutable Private State */

	EnumerableSet.AddressSet private _exempts;
	uint128 private _feeRateNum;
	uint128 private _feeRateDen;
	address private _recipient;

	/* Constructor */

	constructor(
		address recipient_,
		uint128 feeRateNumerator,
		uint128 feeRateDenominator
	) {
		setRecipient(recipient_);
		setFeeRate(feeRateNumerator, feeRateDenominator);
	}

	/* External Views */

	function exemptsAt(uint256 index)
		external
		view
		virtual
		override
		returns (address)
	{
		return _exempts.at(index);
	}

	function exemptsLength() external view virtual override returns (uint256) {
		return _exempts.length();
	}

	function feeRate()
		external
		view
		virtual
		override
		returns (uint128 numerator, uint128 denominator)
	{
		numerator = _feeRateNum;
		denominator = _feeRateDen;
	}

	function getFee(
		address sender,
		address, /* recipient_ */
		uint256 amount
	) external view virtual override returns (uint256) {
		if (_exempts.contains(sender)) {
			return 0;
		}
		return amount.mul(_feeRateNum).div(_feeRateDen);
	}

	function isExempt(address account)
		external
		view
		virtual
		override
		returns (bool)
	{
		return _exempts.contains(account);
	}

	function recipient() external view virtual override returns (address) {
		return _recipient;
	}

	function undoFee(
		address sender,
		address, /* recipient_ */
		uint256 amount
	) external view virtual override returns (uint256) {
		if (_exempts.contains(sender)) {
			return amount;
		}
		return amount.mul(_feeRateDen).div(_feeRateDen - _feeRateNum);
	}

	/* External Mutators */

	function notify(
		uint256 /* amount */
	) external virtual override {
		return;
	}

	function setExempt(address account, bool isExempt_)
		external
		virtual
		override
	{
		if (isExempt_ && _exempts.add(account)) {
			emit ExemptAdded(account);
		} else if (_exempts.remove(account)) {
			emit ExemptRemoved(account);
		}
	}

	/* Public Mutators */

	function setFeeRate(uint128 numerator, uint128 denominator)
		public
		virtual
		override
	{
		// Also guarantees that the denominator cannot be zero.
		require(denominator > numerator, "FeeLogic: feeRate is gte to 1");
		_feeRateNum = numerator;
		_feeRateDen = denominator;
		emit FeeRateSet(numerator, denominator);
	}

	function setRecipient(address account) public virtual override {
		require(account != address(0), "FeeLogic: recipient is zero address");
		_recipient = account;
		emit RecipientSet(account);
	}
}
