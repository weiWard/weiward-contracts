// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "./interfaces/IRewardsManager.sol";
import "./RewardsPoolInstant.sol";

contract ManagedRewardsPoolInstant is RewardsPoolInstant {
	/* Mutable Internal State */

	IRewardsManager internal _manager;

	/* Constructor */

	constructor(
		IERC20 _rewardsToken,
		IERC20 _stakingToken,
		uint8 _stakingTokenDecimals,
		IRewardsManager rewardsManager
	) RewardsPoolInstant(_rewardsToken, _stakingToken, _stakingTokenDecimals) {
		_manager = rewardsManager;
	}

	/* External Mutators */

	function setManager(IRewardsManager account) external onlyOwner {
		_manager = account;
	}

	/* Public Views */

	function manager() public view returns (IRewardsManager) {
		return _manager;
	}

	/* Internal Views */

	function _currentRewardsBalance() internal view override returns (uint256) {
		return _manager.rewardsBalanceOf(address(this));
	}

	/* Internal Mutators */

	function _stakeFrom(address account, uint256 amount) internal override {
		bool wasDeactivated = totalStaked() == 0;
		RewardsPool._stakeFrom(account, amount);
		if (wasDeactivated) {
			_manager.activateShares();
		}
	}

	function _transferRewards(address account, uint256 amount)
		internal
		override
	{
		_manager.redeemRewardTo(account, amount);
	}

	function _unstake(uint256 amount) internal override {
		RewardsPool._unstake(amount);
		if (totalStaked() == 0) {
			_manager.deactivateShares();
		}
	}
}
