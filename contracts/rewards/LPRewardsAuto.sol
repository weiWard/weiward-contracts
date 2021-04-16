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

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../libraries/EnumerableMap.sol";
import "./interfaces/ILPRewardsAuto.sol";
import "./interfaces/IValuePerToken.sol";

contract LPRewardsAuto is Ownable, Pausable, ReentrancyGuard, ILPRewardsAuto {
	using EnumerableMap for EnumerableMap.AddressToUintMap;
	using EnumerableSet for EnumerableSet.AddressSet;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	/* Structs */

	struct TokenData {
		uint256 accruedRewardsPerToken;
		uint256 lastRewardsAccrued;
		uint256 rewards;
		uint256 rewardsRedeemed;
		uint256 totalStaked;
		address valueImpl;
	}

	struct UserTokenRewards {
		uint256 pending;
		uint256 redeemed;
		uint256 accruedPerTokenPaid;
	}

	struct UserData {
		uint256 totalRewards;
		uint256 totalRedeemed;
		EnumerableSet.AddressSet tokensWithRewards;
		mapping(address => UserTokenRewards) rewards;
		EnumerableMap.AddressToUintMap staked;
	}

	/* Immutable Public State */
	address public immutable override rewardsToken;

	/* Immutable Internal State */

	uint256 internal constant _MULTIPLIER = 1e36;

	/* Mutable Internal State */

	uint256 internal _lastTotalRewardsAccrued;
	uint256 internal _totalRewardsRedeemed;
	EnumerableSet.AddressSet internal _tokens;
	mapping(address => TokenData) internal _tokenData;
	mapping(address => UserData) internal _users;

	/* Constructor */

	constructor(address _rewardsToken) Ownable() {
		rewardsToken = _rewardsToken;
	}

	/* External Views */

	function currentAccruedRewardsPerTokenFor(address token)
		external
		view
		override
		returns (uint256)
	{
		return
			_getAccruedRewardsPerTokenFor(
				token,
				this.currentTotalRewardsAccruedFor(token)
			);
	}

	function currentRewardsBalanceOf(address account)
		external
		view
		override
		returns (uint256)
	{
		// Get current pending rewards.
		uint256 totalPending = totalRewardsAccrued() - _lastTotalRewardsAccrued;
		if (totalPending == 0) {
			return this.rewardsBalanceOf(account);
		}

		// Expensive operation, so duplicate return
		uint256 totalShares = _totalShares();
		if (totalShares == 0) {
			return this.rewardsBalanceOf(account);
		}

		UserData storage user = _users[account];
		uint256 total = user.totalRewards;

		// WARNING: Be careful adding too many tokens.
		for (uint256 i = 0; i < user.staked.length(); i++) {
			(address token, ) = user.staked.at(i);

			// Calculate current total rewards accrued for token
			uint256 shares = _totalSharesFor(token);
			uint256 pending = totalPending.mul(shares).div(totalShares);
			uint256 accrued = pending + totalRewardsAccruedFor(token);

			uint256 arpt = _getAccruedRewardsPerTokenFor(token, accrued);

			total = total.add(_pendingRewardsOfFor(account, token, arpt));
		}

		return total;
	}

	function currentRewardsBalanceOfFor(address account, address token)
		external
		view
		override
		returns (uint256)
	{
		uint256 arpt = this.currentAccruedRewardsPerTokenFor(token);
		uint256 rewards = _users[account].rewards[token].pending;
		return rewards.add(_pendingRewardsOfFor(account, token, arpt));
	}

	function currentSharesFor(address token)
		external
		view
		override
		returns (uint256)
	{
		require(_tokens.contains(token), "LPRewardsAuto: token not supported");
		return _totalSharesFor(token);
	}

	function currentSharesOf(address account)
		external
		view
		override
		returns (uint256 total)
	{
		UserData storage user = _users[account];
		// WARNING: Be careful adding too many tokens.
		for (uint256 i = 0; i < user.staked.length(); i++) {
			(address token, uint256 amount) = user.staked.at(i);
			total = total.add(_shares(token, amount));
		}
		return total;
	}

	function currentSharesOfFor(address account, address token)
		external
		view
		override
		returns (uint256)
	{
		require(_tokens.contains(token), "LPRewardsAuto: token not supported");
		return _shares(token, stakedBalanceOfFor(account, token));
	}

	function currentSharesPerTokenFor(address token)
		external
		view
		override
		returns (uint256)
	{
		require(_tokens.contains(token), "LPRewardsAuto: token not supported");
		return _shares(token, 1);
	}

	function currentTotalRewardsAccruedFor(address token)
		external
		view
		override
		returns (uint256)
	{
		uint256 lastRewardsAccrued = totalRewardsAccruedFor(token);

		// Get current pending rewards.
		uint256 totalPending = totalRewardsAccrued() - _lastTotalRewardsAccrued;
		if (totalPending == 0) {
			return lastRewardsAccrued;
		}

		// Divide pending by share
		uint256 totalShares = _totalShares();
		if (totalShares == 0) {
			return lastRewardsAccrued;
		}
		uint256 shares = _totalSharesFor(token);
		uint256 pending = totalPending.mul(shares).div(totalShares);

		// Overflow is OK
		return pending + lastRewardsAccrued;
	}

	function currentTotalShares() external view override returns (uint256) {
		return _totalShares();
	}

	function numStakingTokens() external view override returns (uint256) {
		return _tokens.length();
	}

	function rewardsBalanceOf(address account)
		external
		view
		override
		returns (uint256)
	{
		UserData storage user = _users[account];
		uint256 total = user.totalRewards;
		// WARNING: Be careful adding too many tokens.
		for (uint256 i = 0; i < user.staked.length(); i++) {
			(address token, ) = user.staked.at(i);
			uint256 arpt = accruedRewardsPerTokenFor(token);
			total = total.add(_pendingRewardsOfFor(account, token, arpt));
		}
		return total;
	}

	function rewardsBalanceOfFor(address account, address token)
		external
		view
		override
		returns (uint256)
	{
		uint256 arpt = accruedRewardsPerTokenFor(token);
		uint256 rewards = _users[account].rewards[token].pending;
		return rewards.add(_pendingRewardsOfFor(account, token, arpt));
	}

	function rewardsFor(address token) external view override returns (uint256) {
		return _tokenData[token].rewards;
	}

	function rewardsRedeemedBy(address account)
		external
		view
		override
		returns (uint256)
	{
		return _users[account].totalRedeemed;
	}

	function rewardsRedeemedByFor(address account, address token)
		external
		view
		override
		returns (uint256)
	{
		return _users[account].rewards[token].redeemed;
	}

	function stakingTokenAt(uint256 index)
		external
		view
		override
		returns (address)
	{
		return _tokens.at(index);
	}

	function supportsStakingToken(address token)
		external
		view
		override
		returns (bool)
	{
		return _tokens.contains(token);
	}

	/* External Mutators */

	function addToken(address token, address tokenValueImpl)
		external
		override
		onlyOwner
	{
		_addToken(token, tokenValueImpl);
	}

	function changeTokenValueImpl(address token, address tokenValueImpl)
		external
		override
		onlyOwner
	{
		_changeTokenValueImpl(token, tokenValueImpl);
	}

	function exit() external override nonReentrant {
		_exit();
	}

	function exitFrom(address token) external override nonReentrant {
		_exitFrom(token);
	}

	function pause() external override onlyOwner {
		_pause();
	}

	function recoverUnstaked(
		address token,
		address to,
		uint256 amount
	) external override onlyOwner {
		_recoverUnstaked(token, to, amount);
	}

	function redeemAllRewards() external override nonReentrant {
		_redeemAllRewards();
	}

	function redeemAllRewardsFrom(address token) external override nonReentrant {
		_redeemAllRewardsFrom(token);
	}

	function redeemReward(uint256 amount) external override nonReentrant {
		_redeemReward(amount);
	}

	function redeemRewardFrom(address token, uint256 amount)
		external
		override
		nonReentrant
	{
		_redeemRewardFrom(token, amount);
	}

	function removeToken(address token) external override onlyOwner {
		_removeToken(token);
	}

	function stake(address token, uint256 amount)
		external
		override
		nonReentrant
		whenNotPaused
	{
		_stake(token, amount);
	}

	function unpause() external override onlyOwner {
		_unpause();
	}

	function unstake(address token, uint256 amount)
		external
		override
		nonReentrant
	{
		_unstake(token, amount);
	}

	function unstakeAll() external override nonReentrant {
		_unstakeAll();
	}

	function unstakeAllFrom(address token) external override nonReentrant {
		_unstakeAllFrom(token);
	}

	function updateReward() external override nonReentrant {
		_updateRewardFor(_msgSender());
	}

	function updateRewardFor(address account) external override nonReentrant {
		_updateRewardFor(account);
	}

	function updateTokenRewards() external override nonReentrant {
		_updateRewards();
	}

	/* Public Views */

	function accruedRewardsPerTokenFor(address token)
		public
		view
		override
		returns (uint256)
	{
		return _getAccruedRewardsPerTokenFor(token, totalRewardsAccruedFor(token));
	}

	function accruedRewardsPerTokenPaidFor(address account, address token)
		public
		view
		override
		returns (uint256)
	{
		return _users[account].rewards[token].accruedPerTokenPaid;
	}

	function stakedBalanceOfFor(address account, address token)
		public
		view
		override
		returns (uint256)
	{
		EnumerableMap.AddressToUintMap storage staked = _users[account].staked;
		if (staked.contains(token)) {
			return staked.get(token);
		}
		return 0;
	}

	function totalRewardsAccrued() public view override returns (uint256) {
		// Overflow is OK
		return _currentRewardsBalance() + _totalRewardsRedeemed;
	}

	function totalRewardsAccruedFor(address token)
		public
		view
		override
		returns (uint256)
	{
		TokenData storage td = _tokenData[token];
		// Overflow is OK
		return td.rewards + td.rewardsRedeemed;
	}

	function totalRewardsRedeemed() public view override returns (uint256) {
		return _totalRewardsRedeemed;
	}

	function totalRewardsRedeemedFor(address token)
		public
		view
		override
		returns (uint256)
	{
		return _tokenData[token].rewardsRedeemed;
	}

	function totalStakedFor(address token)
		public
		view
		override
		returns (uint256)
	{
		return _tokenData[token].totalStaked;
	}

	function valuePerTokenImplFor(address token)
		public
		view
		override
		returns (address)
	{
		return _tokenData[token].valueImpl;
	}

	/* Internal Views */

	function _currentRewardsBalance() internal view virtual returns (uint256) {
		return IERC20(rewardsToken).balanceOf(address(this));
	}

	function _getAccruedRewardsPerTokenFor(
		address token,
		uint256 totalRewardsAccruedForToken
	) internal view virtual returns (uint256) {
		TokenData storage td = _tokenData[token];
		if (td.totalStaked == 0) {
			return td.accruedRewardsPerToken;
		}

		// Overflow is OK: delta is correct anyway
		uint256 delta = totalRewardsAccruedForToken - td.lastRewardsAccrued;
		if (delta == 0) {
			return td.accruedRewardsPerToken;
		}

		// Usemultiplier for better rounding
		uint256 rewardsPerToken = delta.mul(_MULTIPLIER).div(td.totalStaked);

		// Overflow is OK
		return td.accruedRewardsPerToken + rewardsPerToken;
	}

	function _pendingRewardsOfFor(
		address account,
		address token,
		uint256 accruedRewardsPerToken
	) internal view virtual returns (uint256) {
		uint256 arptPaid = accruedRewardsPerTokenPaidFor(account, token);
		// Overflow is OK: delta is correct anyway
		uint256 accruedDelta = accruedRewardsPerToken - arptPaid;

		// Divide by _MULTIPLIER to convert back to rewards decimals
		return
			stakedBalanceOfFor(account, token).mul(accruedDelta).div(_MULTIPLIER);
	}

	/**
	 * We base the number of shares you receive on the number of ETHtx that are
	 * staked to the token contract. A market maker could consider trying to game
	 * this by depositing a lot of ETHtx and very little WETH, but they would
	 * end up losing more money than they would gain from rewards because the
	 * market would naturally take advantage of this arbitrage between the
	 * weiWard contract price and the LP price.
	 */
	function _shares(address token, uint256 amountStaked)
		internal
		view
		returns (uint256)
	{
		IValuePerToken vptHandle = IValuePerToken(valuePerTokenImplFor(token));
		(uint256 numerator, uint256 denominator) = vptHandle.valuePerToken();
		if (denominator == 0) {
			return 0;
		}
		// TODO handle fractional (i.e. improve rounding)
		// Return a 1:1 ratio for value to shares
		return amountStaked.mul(numerator).div(denominator);
	}

	function _totalShares() internal view returns (uint256 total) {
		// WARNING: Be careful adding too many tokens.
		for (uint256 i = 0; i < _tokens.length(); i++) {
			total = total.add(_totalSharesFor(_tokens.at(i)));
		}
	}

	function _totalSharesFor(address token) internal view returns (uint256) {
		return _shares(token, _tokenData[token].totalStaked);
	}

	/* Internal Mutators */

	/**
	 * WARNING: Avoid adding too many tokens to save on gas.
	 * See {LPRewardsAuto-_updateRewards} for explanation.
	 */
	function _addToken(address token, address tokenValueImpl) internal {
		require(!_tokens.contains(token), "LPRewardsAuto: token already added");
		require(
			tokenValueImpl != address(0),
			"LPRewardsAuto: tokenValueImpl cannot be zero address"
		);
		_updateRewards();
		_tokens.add(token);
		// Only update implementation in case this was previously used
		_tokenData[token].valueImpl = tokenValueImpl;
		emit TokenAdded(token, tokenValueImpl);
	}

	function _changeTokenValueImpl(address token, address tokenValueImpl)
		internal
	{
		require(
			_tokens.contains(token),
			"LPRewardsAuto: token has not been added"
		);
		require(
			tokenValueImpl != address(0),
			"LPRewardsAuto: tokenValueImpl cannot be zero address"
		);
		_updateRewards();
		_tokenData[token].valueImpl = tokenValueImpl;
		emit TokenValueImplChanged(token, tokenValueImpl);
	}

	function _exit() internal virtual {
		// TODO perform simultaneously to optimize
		_unstakeAll();
		_redeemAllRewards();
	}

	function _exitFrom(address token) internal virtual {
		// TODO perform simultaneously to optimize
		_unstakeAllFrom(token);
		_redeemAllRewardsFrom(token);
	}

	function _recoverUnstaked(
		address token,
		address to,
		uint256 amount
	) internal {
		uint256 unstaked =
			IERC20(token).balanceOf(address(this)).sub(
				_tokenData[token].totalStaked
			);

		require(
			amount <= unstaked,
			"LPRewardsAuto: cannot recover more tokens than are not staked"
		);

		IERC20(token).safeTransfer(to, amount);
		emit RecoveredUnstaked(token, to, amount);
	}

	function _redeemAllRewards() internal virtual {
		address account = _msgSender();
		_updateRewardFor(account);
		uint256 amount = _users[account].totalRewards;
		_redeemRewardImpl(account, amount);
	}

	function _redeemAllRewardsFrom(address token) internal virtual {
		address account = _msgSender();
		_updateRewardFor(account);
		uint256 amount = _users[account].rewards[token].pending;
		_redeemRewardFromImpl(account, token, amount);
	}

	function _redeemReward(uint256 amount) internal virtual {
		address account = _msgSender();
		_updateRewardFor(account);
		uint256 reward = _users[account].totalRewards;
		require(
			amount <= reward,
			"LPRewardsAuto: cannot redeem more rewards than you have earned"
		);
		_redeemRewardImpl(account, amount);
	}

	function _redeemRewardFrom(address token, uint256 amount) internal virtual {
		address account = _msgSender();
		_updateRewardFor(account);
		uint256 reward = _users[account].rewards[token].pending;
		require(
			amount <= reward,
			"LPRewardsAuto: cannot redeem more rewards than you have earned"
		);
		_redeemRewardFromImpl(account, token, amount);
	}

	function _redeemRewardImpl(address account, uint256 amount)
		internal
		virtual
	{
		if (amount == 0) {
			return;
		}

		uint256 amountLeft = amount;
		UserData storage user = _users[account];
		// WARNING: Be careful adding too many tokens.
		uint256 i = 0;
		uint256 length = user.tokensWithRewards.length();
		while (i < length) {
			address token = user.tokensWithRewards.at(i);

			UserTokenRewards storage rewards = user.rewards[token];
			if (rewards.pending == 0) {
				continue;
			}

			TokenData storage td = _tokenData[token];

			uint256 taken = Math.min(rewards.pending, amountLeft);

			// Update loop params
			if (taken == rewards.pending && !user.staked.contains(token)) {
				// Remove from Set since no more rewards can be accrued.
				user.tokensWithRewards.remove(token);
				length--;
			} else {
				i++;
			}

			// Update values
			rewards.pending -= taken;
			rewards.redeemed += taken;

			td.rewards = td.rewards.sub(taken);
			td.rewardsRedeemed += taken;

			amountLeft -= taken;

			if (amountLeft == 0) {
				break;
			}
		}

		require(amountLeft == 0, "LPRewardsAuto: failed to redeem enough rewards");

		user.totalRewards = user.totalRewards.sub(amount);
		user.totalRedeemed += amount;
		_totalRewardsRedeemed += amount;

		_transferRewards(account, amount);
		emit RewardPaid(account, amount);
	}

	function _redeemRewardFromImpl(
		address account,
		address token,
		uint256 amount
	) internal virtual {
		// Exit on zero, especially to protect from addresses without a history
		if (amount == 0) {
			return;
		}

		TokenData storage td = _tokenData[token];
		UserData storage user = _users[account];
		UserTokenRewards storage rewards = user.rewards[token];

		rewards.pending = rewards.pending.sub(amount);
		rewards.redeemed += amount;

		user.totalRewards = user.totalRewards.sub(amount);
		user.totalRedeemed += amount;

		td.rewards = td.rewards.sub(amount);
		td.rewardsRedeemed += amount;

		_totalRewardsRedeemed += amount;

		_transferRewards(account, amount);
		emit RewardPaid(account, amount);
	}

	function _removeToken(address token) internal {
		require(
			_tokens.contains(token),
			"LPRewardsAuto: token has not been added"
		);
		_updateRewards();
		_tokens.remove(token);
		// Clean up. Keep totalStaked and rewards since those will be cleaned up by
		// users unstaking and redeeming
		_tokenData[token].valueImpl = address(0);
		emit TokenRemoved(token);
	}

	function _stake(address token, uint256 amount) internal virtual {
		require(amount > 0, "LPRewardsAuto: cannot stake zero");
		require(_tokens.contains(token), "LPRewardsAuto: token not supported");

		address account = _msgSender();

		// Prevent spending gas without having a balance
		uint256 balance = IERC20(token).balanceOf(account);
		require(
			amount <= balance,
			"LPRewardsAuto: cannot stake more than balance"
		);

		// Prevent spending gas without having an allowance
		uint256 allowance = IERC20(token).allowance(account, address(this));
		require(
			amount <= allowance,
			"LPRewardsAuto: cannot stake more than allowance"
		);

		UserData storage user = _users[account];

		_updateRewardOfFor(account, token);
		user.tokensWithRewards.add(token);

		TokenData storage td = _tokenData[token];
		td.totalStaked = td.totalStaked.add(amount);

		uint256 totalStaked = amount;
		if (user.staked.contains(token)) {
			totalStaked = totalStaked.add(stakedBalanceOfFor(account, token));
		}
		user.staked.set(token, totalStaked);

		IERC20(token).safeTransferFrom(account, address(this), amount);
		emit Staked(account, amount);
	}

	function _transferRewards(address account, uint256 amount) internal virtual {
		IERC20(rewardsToken).safeTransfer(account, amount);
	}

	function _unstake(address token, uint256 amount) internal virtual {
		require(amount > 0, "LPRewardsAuto: cannot unstake zero");

		address account = _msgSender();
		// This prevents making calls to any addresses that were never supported.
		uint256 staked = stakedBalanceOfFor(account, token);
		require(
			amount <= staked,
			"LPRewardsAuto: cannot unstake more than staked balance"
		);

		_updateRewardOfFor(account, token);

		TokenData storage td = _tokenData[token];
		td.totalStaked = td.totalStaked.sub(amount);

		UserData storage user = _users[account];
		uint256 stakeLeft = staked.sub(amount);
		if (stakeLeft == 0) {
			user.staked.remove(token);
			if (user.rewards[token].pending == 0) {
				user.tokensWithRewards.remove(token);
			}
		} else {
			user.staked.set(token, stakeLeft);
		}

		IERC20(token).safeTransfer(account, amount);
		emit Unstaked(account, amount);
	}

	function _unstakeAll() internal virtual {
		UserData storage user = _users[_msgSender()];
		// WARNING: Be careful adding too many tokens.
		for (uint256 length = user.staked.length(); length > 0; length--) {
			(address token, uint256 amount) = user.staked.at(0);
			_unstake(token, amount);
		}
	}

	function _unstakeAllFrom(address token) internal virtual {
		_unstake(token, stakedBalanceOfFor(_msgSender(), token));
	}

	function _updateAccrualFor(address token) internal {
		uint256 rewardsAccrued = totalRewardsAccruedFor(token);
		TokenData storage td = _tokenData[token];
		td.accruedRewardsPerToken = _getAccruedRewardsPerTokenFor(
			token,
			rewardsAccrued
		);
		td.lastRewardsAccrued = rewardsAccrued;
	}

	function _updateRewardFor(address account) internal {
		_updateRewards();

		UserData storage user = _users[account];
		uint256 totalRewards = user.totalRewards;

		for (uint256 i = 0; i < user.staked.length(); i++) {
			(address token, ) = user.staked.at(i);
			uint256 pending = _updateRewardOfForImpl(account, token);
			totalRewards = totalRewards.add(pending);
		}

		user.totalRewards = totalRewards;
	}

	function _updateRewardOfFor(address account, address token) internal {
		_updateRewards();
		uint256 pending = _updateRewardOfForImpl(account, token);
		UserData storage user = _users[account];
		user.totalRewards = user.totalRewards.add(pending);
	}

	function _updateRewardOfForImpl(address account, address token)
		internal
		returns (uint256 pending)
	{
		_updateAccrualFor(token);

		// updateAccrual updates accruedRewardsPerToken
		uint256 arpt = _tokenData[token].accruedRewardsPerToken;
		pending = _pendingRewardsOfFor(account, token, arpt);

		// Update values
		UserTokenRewards storage rewards = _users[account].rewards[token];
		rewards.accruedPerTokenPaid = arpt;
		rewards.pending = rewards.pending.add(pending);
	}

	/**
	 * We have to allocate rewards all at once because shares can change over
	 * time without interacting with this contract.
	 * As such, avoid adding too many tokens to save on gas.
	 * E.G. When working with multiple liquidity pools on different DEXs,
	 * shares per token will change with price.
	 */
	function _updateRewards() internal {
		// Get current pending rewards.
		uint256 _totalRewardsAccrued = totalRewardsAccrued();
		uint256 pending = _totalRewardsAccrued - _lastTotalRewardsAccrued;
		// Update last before iterating, just in case.
		_lastTotalRewardsAccrued = _totalRewardsAccrued;

		// Iterate once to know totalShares.
		uint256 totalShares = 0;
		// Store some math for current shares to save on gas and revert ASAP.
		uint256[] memory pendingSharesFor = new uint256[](_tokens.length());
		for (uint256 i = 0; i < _tokens.length(); i++) {
			uint256 share = _totalSharesFor(_tokens.at(i));
			pendingSharesFor[i] = pending.mul(share);
			totalShares = totalShares.add(share);
		}

		if (totalShares == 0) {
			return;
		}

		// Iterate twice to give rewards.
		for (uint256 i = 0; i < _tokens.length(); i++) {
			uint256 reward = pendingSharesFor[i].div(totalShares);
			TokenData storage td = _tokenData[_tokens.at(i)];
			td.rewards = td.rewards.add(reward);
		}

		// Don't need to store last values and interpolate because:
		// If we assume all dex's prices are equal (a false assumption but perhaps a safe one), their reserves should move up and down together; thus, they maintain relative share value. Then we can update rewards without extrapolating what the shares might have been over time. If it's problematic, we can manually call this update on a regular interval. The same would be true if dex prices relative to each other were swinging violently anyway - extrapolation wouldn't work. Besides, this behaviour would incentivize the use of low volume DEXs, since they'd get more rewards than they should (low volume always means high price). Or we can just choose to remove a low volume dex.
	}
}
