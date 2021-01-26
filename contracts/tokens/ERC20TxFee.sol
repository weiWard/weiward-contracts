// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "./ERC20.sol";

import "../rewards/interfaces/IFeeLogic.sol";

/**
 * @dev Adds a transfer fee to {ERC20} using the {IFeeLogic} interface.
 */
contract ERC20TxFee is ERC20 {
	using SafeMath for uint256;

	/* Mutable Internal State */

	address internal _feeLogic;

	/* Constructor */

	constructor(
		string memory name_,
		string memory symbol_,
		uint8 decimals_,
		address feeLogic_
	) ERC20(name_, symbol_, decimals_) {
		require(feeLogic_ != address(0), "ERC20TxFee: feeLogic zero address");
		_feeLogic = feeLogic_;
	}

	/* Public Views */

	/**
	 * @dev Returns the feeLogic handler address.
	 */
	function feeLogic() public view virtual returns (address) {
		return _feeLogic;
	}

	/* Internal Mutators */

	/**
	 * @dev Overrides {ERC20-_transfer} to implement a fee on transfers.
	 *
	 * Emits a {Transfer} event. Emits a second {Transfer} event for the fee.
	 *
	 * Requirements:
	 *
	 * - `sender` cannot be the zero address.
	 * - `recipient` cannot be the zero address.
	 * - `sender` must have a balance of at least `amount`.
	 * - `_feeLogic` implements {IFeeLogic}
	 */
	function _transfer(
		address sender,
		address recipient,
		uint256 amount
	) internal virtual override {
		require(sender != address(0), "ERC20: transfer from the zero address");
		require(recipient != address(0), "ERC20: transfer to the zero address");

		_beforeTokenTransfer(sender, recipient, amount);

		_balances[sender] = _balances[sender].sub(
			amount,
			"ERC20: transfer amount exceeds balance"
		);

		IFeeLogic feeHandler = IFeeLogic(_feeLogic);
		uint256 fee = feeHandler.getFee(sender, recipient, amount);
		uint256 amountSubFee = amount.sub(fee);

		_balances[recipient] = _balances[recipient].add(amountSubFee);
		emit Transfer(sender, recipient, amountSubFee);

		if (fee != 0) {
			address feeRecipient = feeHandler.recipient();
			_balances[feeRecipient] = _balances[feeRecipient].add(fee);
			emit Transfer(sender, feeRecipient, fee);
			feeHandler.notify(fee);
		}
	}
}
