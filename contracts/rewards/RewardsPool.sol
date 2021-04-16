// SPDX-License-Identifier: Apache-2.0

/**
 * Copyright 2021 weiWard LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/GSN/Context.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IRewardsPool.sol";

abstract contract RewardsPool is
	Context,
	ReentrancyGuard,
	Ownable,
	Pausable,
	IRewardsPool
{
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	/* Immutable Public State */

	IERC20 public immutable override rewardsToken;
	IERC20 public immutable override stakingToken;
	uint8 public immutable override stakingTokenDecimals;

	/* Mutable Internal State */

	mapping(address => uint256) internal _rewards;
	uint256 internal _rewardsRedeemed;
	mapping(address => uint256) internal _rewardsRedeemedBy;
	mapping(address => uint256) internal _staked;
	uint256 internal _totalStaked;

	/* Immutable Private State */

	uint256 private immutable _stakingTokenBase;

	/* Constructor */

	constructor(
		IERC20 _rewardsToken,
		IERC20 _stakingToken,
		uint8 _stakingTokenDecimals
	) Ownable() {
		// Prevent overflow, though 76 would create a safe but unusable contract
		require(
			_stakingTokenDecimals < (77 - 18),
			"RewardsPool: staking token has far too many decimals"
		);

		rewardsToken = _rewardsToken;

		stakingToken = _stakingToken;
		stakingTokenDecimals = _stakingTokenDecimals;
		// Add some breathing room for more accurate rounding
		_stakingTokenBase = 10**(_stakingTokenDecimals + 18);
	}

	/* Public Views */

	function rewardsBalanceOf(address account)
		public
		view
		virtual
		override
		returns (uint256);

	function rewardsRedeemedBy(address account)
		public
		view
		override
		returns (uint256)
	{
		return _rewardsRedeemedBy[account];
	}

	function stakedBalanceOf(address account)
		public
		view
		override
		returns (uint256)
	{
		return _staked[account];
	}

	function totalRewardsAccrued() public view override returns (uint256) {
		// Overflow is OK
		return _currentRewardsBalance() + _rewardsRedeemed;
	}

	function totalRewardsRedeemed() public view override returns (uint256) {
		return _rewardsRedeemed;
	}

	function totalStaked() public view override returns (uint256) {
		return _totalStaked;
	}

	/* Public Mutators */

	function exit() public override nonReentrant {
		_exit();
	}

	function pause() public override onlyOwner {
		_pause();
	}

	// In the event that staking tokens are accidentally sent to the contract
	// without staking.
	function recoverUnstakedTokens(address to, uint256 amount)
		public
		override
		onlyOwner
	{
		_recoverUnstakedTokens(to, amount);
	}

	// In the unlikely event that unsupported tokens are successfully sent to the
	// contract. This will also allow for removal of airdropped tokens.
	function recoverUnsupportedERC20(
		IERC20 token,
		address to,
		uint256 amount
	) public override onlyOwner {
		_recoverUnsupportedERC20(token, to, amount);
	}

	function redeemAllRewards() public override nonReentrant {
		_redeemAllRewards();
	}

	function redeemReward(uint256 amount) public override nonReentrant {
		_redeemReward(amount);
	}

	function stake(uint256 amount) public override nonReentrant whenNotPaused {
		_stakeFrom(_msgSender(), amount);
	}

	function unpause() public override onlyOwner {
		_unpause();
	}

	function unstake(uint256 amount) public override nonReentrant {
		_unstake(amount);
	}

	function unstakeAll() public override nonReentrant {
		_unstakeAll();
	}

	function updateReward() public override nonReentrant {
		_updateRewardFor(_msgSender());
	}

	function updateRewardFor(address account) public override nonReentrant {
		_updateRewardFor(account);
	}

	/* Internal Views */

	function _currentRewardsBalance() internal view virtual returns (uint256) {
		return rewardsToken.balanceOf(address(this));
	}

	function _getStakingTokenBase() internal view returns (uint256) {
		return _stakingTokenBase;
	}

	/* Internal Mutators */

	function _exit() internal virtual {
		_unstakeAll();
		_redeemAllRewards();
	}

	function _recoverUnstakedTokens(address to, uint256 amount)
		internal
		virtual
	{
		uint256 unstakedBalance =
			stakingToken.balanceOf(address(this)).sub(_totalStaked);
		require(
			amount <= unstakedBalance,
			"RewardsPool: cannot recover more tokens than are not staked"
		);
		stakingToken.safeTransfer(to, amount);
		emit RecoveredUnstaked(to, amount);
	}

	function _recoverUnsupportedERC20(
		IERC20 token,
		address to,
		uint256 amount
	) internal virtual {
		require(
			token != stakingToken,
			"RewardsPool: cannot recover the staking token"
		);
		require(
			token != rewardsToken,
			"RewardsPool: cannot recover the rewards token"
		);
		token.safeTransfer(to, amount);
		emit RecoveredUnsupported(token, to, amount);
	}

	function _redeemAllRewards() internal virtual {
		address account = _msgSender();
		_updateRewardFor(account);
		uint256 amount = _rewards[account];
		_redeemRewardImpl(account, amount);
	}

	function _redeemReward(uint256 amount) internal virtual {
		address account = _msgSender();
		_updateRewardFor(account);
		uint256 reward = _rewards[account];
		require(
			amount <= reward,
			"RewardsPool: cannot redeem more rewards than you have earned"
		);
		_redeemRewardImpl(account, amount);
	}

	function _redeemRewardImpl(address account, uint256 amount)
		internal
		virtual
	{
		if (amount == 0) {
			return;
		}
		_rewards[account] = _rewards[account].sub(amount);
		// Overflow is OK
		_rewardsRedeemed += amount;
		_rewardsRedeemedBy[account] += amount;
		_transferRewards(account, amount);
		emit RewardPaid(account, amount);
	}

	function _stakeFrom(address account, uint256 amount) internal virtual {
		require(
			account != address(0),
			"RewardsPool: cannot stake from the zero address"
		);
		require(amount > 0, "RewardsPool: cannot stake zero");

		// Prevent spending gas without having a balance
		uint256 balance = stakingToken.balanceOf(account);
		require(amount <= balance, "RewardsPool: cannot stake more than balance");

		// Prevent spending gas without having an allowance
		uint256 allowance = stakingToken.allowance(account, address(this));
		require(
			amount <= allowance,
			"RewardsPool: cannot stake more than allowance"
		);

		_updateRewardFor(account);
		_totalStaked = _totalStaked.add(amount);
		_staked[account] = _staked[account].add(amount);
		stakingToken.safeTransferFrom(account, address(this), amount);
		emit Staked(account, amount);
	}

	function _transferRewards(address account, uint256 amount) internal virtual {
		rewardsToken.safeTransfer(account, amount);
	}

	function _unstake(uint256 amount) internal virtual {
		require(amount > 0, "RewardsPool: cannot unstake zero");
		address account = _msgSender();

		uint256 staked = stakedBalanceOf(account);
		require(
			amount <= staked,
			"RewardsPool: cannot unstake more than staked balance"
		);

		_updateRewardFor(account);
		_totalStaked = _totalStaked.sub(amount);
		_staked[account] = _staked[account].sub(amount);
		stakingToken.safeTransfer(account, amount);
		emit Unstaked(account, amount);
	}

	function _unstakeAll() internal virtual {
		_unstake(_staked[_msgSender()]);
	}

	function _updateRewardFor(address account) internal virtual;
}
