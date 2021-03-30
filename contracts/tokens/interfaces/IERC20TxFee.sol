// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface IERC20TxFee {
	/* Views */

	function feeLogic() external view returns (address);
}
