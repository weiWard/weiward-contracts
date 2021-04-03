// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IERC20TxFee {
	/* Views */

	function feeLogic() external view returns (address);
}
