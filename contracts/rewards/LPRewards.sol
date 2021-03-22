// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../libraries/EnumerableMap.sol";
import "./interfaces/ILPRewards.sol";
import "./interfaces/IValuePerToken.sol";

contract LPRewards is Ownable, Pausable, ILPRewards {
	using EnumerableMap for EnumerableMap.AddressToUintMap;
	using EnumerableSet for EnumerableSet.AddressSet;
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	/* Structs */

	struct TokenData {
		uint256 arpt;
		uint256 lastRewardsAccrued;
		uint256 rewards;
		uint256 rewardsRedeemed;
		uint256 totalStaked;
		address valueImpl;
	}

	struct UserTokenRewards {
		uint256 pending;
		uint256 redeemed;
		uint256 arptLast;
	}

	struct UserData {
		uint256 totalRedeemed;
		EnumerableSet.AddressSet tokensWithRewards;
		mapping(address => UserTokenRewards) rewardsFor;
		EnumerableMap.AddressToUintMap staked;
	}

	/* Immutable Public State */

	address public immutable override rewardsToken;

	/* Immutable Internal State */

	uint256 internal constant _MULTIPLIER = 1e36;

	/* Mutable Internal State */

	uint256 internal _lastTotalRewardsAccrued;
	uint256 internal _totalRewardsRedeemed;
	uint256 internal _unredeemableRewards;
	EnumerableSet.AddressSet internal _tokens;
	mapping(address => TokenData) internal _tokenData;
	mapping(address => UserData) internal _users;

	/* Constructor */

	constructor(address rewardsToken_) Ownable() {
		rewardsToken = rewardsToken_;
	}

	/* Modifiers */

	modifier supportsToken(address token) {
		require(supportsStakingToken(token), "LPRewards: unsupported token");
		_;
	}

	/* Public Views */

	function accruedRewardsPerTokenFor(address token)
		public
		view
		override
		returns (uint256)
	{
		return _tokenData[token].arpt;
	}

	function accruedRewardsPerTokenLastFor(address account, address token)
		public
		view
		override
		returns (uint256)
	{
		return _users[account].rewardsFor[token].arptLast;
	}

	function lastRewardsBalanceOf(address account)
		public
		view
		override
		returns (uint256 total)
	{
		UserData storage user = _users[account];
		EnumerableSet.AddressSet storage tokens = user.tokensWithRewards;
		for (uint256 i = 0; i < tokens.length(); i++) {
			total += user.rewardsFor[tokens.at(i)].pending;
		}
	}

	function lastRewardsBalanceOfFor(address account, address token)
		public
		view
		override
		returns (uint256)
	{
		return _users[account].rewardsFor[token].pending;
	}

	function lastTotalRewardsAccrued() external view override returns (uint256) {
		return _lastTotalRewardsAccrued;
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
		return lastRewardsBalanceOf(account) + _allPendingRewardsFor(account);
	}

	function rewardsBalanceOfFor(address account, address token)
		external
		view
		override
		returns (uint256)
	{
		uint256 rewards = lastRewardsBalanceOfFor(account, token);
		uint256 amountStaked = stakedBalanceOf(account, token);
		if (amountStaked != 0) {
			rewards += _pendingRewardsFor(account, token, amountStaked);
		}
		return rewards;
	}

	function rewardsForToken(address token)
		external
		view
		override
		returns (uint256)
	{
		return _tokenData[token].rewards;
	}

	function rewardsRedeemedBy(address account)
		external
		view
		override
		returns (uint256 redeemed)
	{
		return _users[account].totalRedeemed;
	}

	function rewardsRedeemedByFor(address account, address token)
		external
		view
		override
		returns (uint256)
	{
		return _users[account].rewardsFor[token].redeemed;
	}

	function sharesFor(address account, address token)
		external
		view
		override
		supportsToken(token)
		returns (uint256)
	{
		return _shares(token, stakedBalanceOf(account, token));
	}

	function sharesPerToken(address token)
		external
		view
		override
		supportsToken(token)
		returns (uint256)
	{
		return _shares(token, 1e18);
	}

	function stakedBalanceOf(address account, address token)
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

	function stakingTokenAt(uint256 index)
		external
		view
		override
		returns (address)
	{
		return _tokens.at(index);
	}

	function supportsStakingToken(address token)
		public
		view
		override
		returns (bool)
	{
		return _tokens.contains(token);
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

	function totalRewardsRedeemed() external view override returns (uint256) {
		return _totalRewardsRedeemed;
	}

	function totalRewardsRedeemedFor(address token)
		external
		view
		override
		returns (uint256)
	{
		return _tokenData[token].rewardsRedeemed;
	}

	function totalShares() external view override returns (uint256 total) {
		for (uint256 i = 0; i < _tokens.length(); i++) {
			total = total.add(_totalSharesForToken(_tokens.at(i)));
		}
	}

	function totalSharesFor(address account)
		external
		view
		override
		returns (uint256 total)
	{
		EnumerableMap.AddressToUintMap storage staked = _users[account].staked;
		for (uint256 i = 0; i < staked.length(); i++) {
			(address token, uint256 amount) = staked.at(i);
			// Ignore if it's no longer supported
			if (supportsStakingToken(token)) {
				total = total.add(_shares(token, amount));
			}
		}
	}

	function totalSharesForToken(address token)
		external
		view
		override
		supportsToken(token)
		returns (uint256)
	{
		return _totalSharesForToken(token);
	}

	function totalStaked(address token) public view override returns (uint256) {
		return _tokenData[token].totalStaked;
	}

	function unredeemableRewards() external view override returns (uint256) {
		return _unredeemableRewards;
	}

	function valuePerTokenImpl(address token)
		public
		view
		override
		supportsToken(token)
		returns (address)
	{
		return _tokenData[token].valueImpl;
	}

	/* Public Mutators */

	function addToken(address token, address tokenValueImpl)
		external
		override
		onlyOwner
	{
		require(!supportsStakingToken(token), "LPRewards: token already added");
		require(
			tokenValueImpl != address(0),
			"LPRewards: tokenValueImpl cannot be zero address"
		);
		_tokens.add(token);
		// Only update implementation in case this was previously used and removed
		_tokenData[token].valueImpl = tokenValueImpl;
		emit TokenAdded(_msgSender(), token, tokenValueImpl);
	}

	function exit() external override {
		// TODO perform simultaneously to optimize gas
		unstakeAll();
		redeemAllRewards();
	}

	function exitFrom(address token) external override {
		// TODO perform simultaneously to optimize gas
		unstakeAllFrom(token);
		redeemAllRewardsFrom(token);
	}

	function pause() external override onlyOwner {
		_pause();
	}

	function recoverUnredeemableRewards(address to, uint256 amount)
		external
		override
		onlyOwner
	{
		require(
			amount <= _unredeemableRewards,
			"LPRewards: recovery amount > unredeemable"
		);
		_unredeemableRewards -= amount;
		IERC20(rewardsToken).safeTransfer(to, amount);
		emit RecoveredUnredeemableRewards(_msgSender(), to, amount);
	}

	function recoverUnstaked(
		address token,
		address to,
		uint256 amount
	) external override onlyOwner supportsToken(token) {
		uint256 unstaked =
			IERC20(token).balanceOf(address(this)).sub(totalStaked(token));

		require(amount <= unstaked, "LPRewards: recovery amount > unstaked");

		IERC20(token).safeTransfer(to, amount);
		emit RecoveredUnstaked(_msgSender(), token, to, amount);
	}

	function recoverUnsupportedERC20(
		address token,
		address to,
		uint256 amount
	) external override onlyOwner {
		require(token != rewardsToken, "LPRewards: cannot recover WETH");

		require(
			!supportsStakingToken(token),
			"LPRewards: cannot recover active staking token"
		);

		require(
			totalStaked(token) == 0,
			"LPRewards: cannot recover inactive staking token"
		);

		IERC20(token).safeTransfer(to, amount);
		emit RecoveredUnsupported(_msgSender(), token, to, amount);
	}

	function redeemAllRewards() public override {
		address account = _msgSender();
		_updateAllRewardsFor(account);

		UserData storage user = _users[account];
		EnumerableSet.AddressSet storage tokens = user.tokensWithRewards;
		uint256 redemption = 0;

		for (uint256 length = tokens.length(); length > 0; length--) {
			address token = tokens.at(0);
			TokenData storage td = _tokenData[token];
			UserTokenRewards storage rewards = user.rewardsFor[token];
			uint256 pending = rewards.pending; // Save gas

			redemption += pending;

			rewards.redeemed += pending;
			rewards.pending = 0;

			td.rewards = td.rewards.sub(pending);
			td.rewardsRedeemed += pending;

			emit RewardPaid(account, token, pending);
			tokens.remove(token);
		}

		user.totalRedeemed += redemption;
		_totalRewardsRedeemed += redemption;

		IERC20(rewardsToken).safeTransfer(account, redemption);
	}

	function redeemAllRewardsFrom(address token) public override {
		address account = _msgSender();
		_updateRewardFor(account, token);
		uint256 pending = _users[account].rewardsFor[token].pending;
		if (pending != 0) {
			_redeemRewardFrom(token, pending);
		}
	}

	function redeemReward(uint256 amount) external override {
		address account = _msgSender();
		_updateAllRewardsFor(account);
		require(
			amount <= lastRewardsBalanceOf(account),
			"LPRewards: cannot redeem more rewards than earned"
		);

		UserData storage user = _users[account];
		EnumerableSet.AddressSet storage tokens = user.tokensWithRewards;
		uint256 amountLeft = amount;

		for (uint256 length = tokens.length(); length > 0; length--) {
			address token = tokens.at(0);
			TokenData storage td = _tokenData[token];
			UserTokenRewards storage rewards = user.rewardsFor[token];

			uint256 pending = rewards.pending; // Save gas
			uint256 taken = 0;
			if (pending <= amountLeft) {
				taken = pending;
				tokens.remove(token);
			} else {
				taken = amountLeft;
			}

			rewards.redeemed += taken;
			rewards.pending = pending - taken;

			td.rewards = td.rewards.sub(taken);
			td.rewardsRedeemed += taken;

			amountLeft -= taken;

			emit RewardPaid(account, token, taken);

			if (amountLeft == 0) {
				break;
			}
		}

		user.totalRedeemed += amount;
		_totalRewardsRedeemed += amount;

		IERC20(rewardsToken).safeTransfer(account, amount);
	}

	function redeemRewardFrom(address token, uint256 amount) external override {
		require(amount != 0, "LPRewards: cannot redeem zero");
		address account = _msgSender();
		_updateRewardFor(account, token);
		require(
			amount <= _users[account].rewardsFor[token].pending,
			"LPRewards: cannot redeem more rewards than earned"
		);
		_redeemRewardFrom(token, amount);
	}

	function removeToken(address token)
		external
		override
		onlyOwner
		supportsToken(token)
	{
		_tokens.remove(token);
		// Clean up. Keep totalStaked and rewards since those will be cleaned up by
		// users unstaking and redeeming.
		_tokenData[token].valueImpl = address(0);
		emit TokenRemoved(_msgSender(), token);
	}

	function stake(address token, uint256 amount)
		external
		override
		whenNotPaused
		supportsToken(token)
	{
		require(amount != 0, "LPRewards: cannot stake zero");

		address account = _msgSender();
		_updateRewardFor(account, token);

		UserData storage user = _users[account];
		TokenData storage td = _tokenData[token];
		td.totalStaked += amount;
		user.staked.set(token, amount + stakedBalanceOf(account, token));

		IERC20(token).safeTransferFrom(account, address(this), amount);
		emit Staked(account, token, amount);
	}

	function unpause() external override onlyOwner {
		_unpause();
	}

	function unstake(address token, uint256 amount) external override {
		require(amount != 0, "LPRewards: cannot unstake zero");

		address account = _msgSender();
		// Prevent making calls to any addresses that were never supported.
		uint256 staked = stakedBalanceOf(account, token);
		require(
			amount <= staked,
			"LPRewards: cannot unstake more than staked balance"
		);

		_unstake(token, amount);
	}

	function unstakeAll() public override {
		UserData storage user = _users[_msgSender()];
		for (uint256 length = user.staked.length(); length > 0; length--) {
			(address token, uint256 amount) = user.staked.at(0);
			_unstake(token, amount);
		}
	}

	function unstakeAllFrom(address token) public override {
		_unstake(token, stakedBalanceOf(_msgSender(), token));
	}

	function updateAccrual() external override {
		_updateAccrual();
	}

	function updateReward() external override {
		_updateAllRewardsFor(_msgSender());
	}

	function updateRewardFor(address token) external override {
		_updateRewardFor(_msgSender(), token);
	}

	/* Internal Views */

	function _accruedRewardsPerTokenFor(address token, uint256 rewardsAccrued)
		internal
		view
		returns (uint256)
	{
		TokenData storage td = _tokenData[token];
		// Gas savings
		uint256 totalStaked_ = td.totalStaked;

		if (totalStaked_ == 0) {
			return td.arpt;
		}

		// Overflow is OK
		uint256 delta = rewardsAccrued - td.lastRewardsAccrued;
		if (delta == 0) {
			return td.arpt;
		}

		// Use multiplier for better rounding
		uint256 rewardsPerToken = delta.mul(_MULTIPLIER) / totalStaked_;

		// Overflow is OK
		return td.arpt + rewardsPerToken;
	}

	function _allPendingRewardsFor(address account)
		internal
		view
		returns (uint256 total)
	{
		EnumerableMap.AddressToUintMap storage staked = _users[account].staked;
		for (uint256 i = 0; i < staked.length(); i++) {
			(address token, uint256 amount) = staked.at(i);
			total += _pendingRewardsFor(account, token, amount);
		}
	}

	function _currentRewardsBalance() internal view returns (uint256) {
		return IERC20(rewardsToken).balanceOf(address(this));
	}

	function _pendingRewardsFor(
		address account,
		address token,
		uint256 amountStaked
	) internal view returns (uint256) {
		uint256 arpt = accruedRewardsPerTokenFor(token);
		uint256 arptLast = accruedRewardsPerTokenLastFor(account, token);
		// Overflow is OK
		uint256 arptDelta = arpt - arptLast;

		return amountStaked.mul(arptDelta) / _MULTIPLIER;
	}

	function _shares(address token, uint256 amountStaked)
		internal
		view
		returns (uint256)
	{
		IValuePerToken vptHandle = IValuePerToken(valuePerTokenImpl(token));
		(uint256 numerator, uint256 denominator) = vptHandle.valuePerToken();
		if (denominator == 0) {
			return 0;
		}
		// Return a 1:1 ratio for value to shares
		return amountStaked.mul(numerator) / denominator;
	}

	function _totalSharesForToken(address token)
		internal
		view
		returns (uint256)
	{
		return _shares(token, _tokenData[token].totalStaked);
	}

	/* Internal Mutators */

	function _redeemRewardFrom(address token, uint256 amount) internal {
		address account = _msgSender();
		UserData storage user = _users[account];
		UserTokenRewards storage rewards = user.rewardsFor[token];
		TokenData storage td = _tokenData[token];
		uint256 rewardLeft = rewards.pending - amount;

		rewards.redeemed += amount;
		rewards.pending = rewardLeft;
		if (rewardLeft == 0) {
			user.tokensWithRewards.remove(token);
		}

		td.rewards = td.rewards.sub(amount);
		td.rewardsRedeemed += amount;

		user.totalRedeemed += amount;
		_totalRewardsRedeemed += amount;

		IERC20(rewardsToken).safeTransfer(account, amount);
		emit RewardPaid(account, token, amount);
	}

	function _unstake(address token, uint256 amount) internal {
		address account = _msgSender();

		_updateRewardFor(account, token);

		TokenData storage td = _tokenData[token];
		td.totalStaked = td.totalStaked.sub(amount);

		UserData storage user = _users[account];
		EnumerableMap.AddressToUintMap storage staked = user.staked;

		uint256 stakeLeft = staked.get(token).sub(amount);
		if (stakeLeft == 0) {
			staked.remove(token);
			user.rewardsFor[token].arptLast = 0;
		} else {
			staked.set(token, stakeLeft);
		}

		IERC20(token).safeTransfer(account, amount);
		emit Unstaked(account, token, amount);
	}

	function _updateAccrual() internal {
		// Gas savings
		uint256 totalRewardsAccrued_ = totalRewardsAccrued();
		uint256 pending = totalRewardsAccrued_ - _lastTotalRewardsAccrued;

		_lastTotalRewardsAccrued = totalRewardsAccrued_;

		// Iterate once to know totalShares
		uint256 totalShares_ = 0;
		// Store some math for current shares to save on gas and revert ASAP.
		uint256[] memory pendingSharesFor = new uint256[](_tokens.length());
		for (uint256 i = 0; i < _tokens.length(); i++) {
			uint256 share = _totalSharesForToken(_tokens.at(i));
			pendingSharesFor[i] = pending.mul(share);
			totalShares_ = totalShares_.add(share);
		}

		if (totalShares_ == 0) {
			_unredeemableRewards = _unredeemableRewards.add(pending);
			return;
		}

		// Iterate twice to give rewards.
		for (uint256 i = 0; i < _tokens.length(); i++) {
			address token = _tokens.at(i);
			_tokenData[token].rewards += pendingSharesFor[i] / totalShares_;
			_updateAccrualFor(token);
		}
	}

	function _updateAccrualFor(address token) internal {
		uint256 rewardsAccrued = totalRewardsAccruedFor(token);
		TokenData storage td = _tokenData[token];
		td.arpt = _accruedRewardsPerTokenFor(token, rewardsAccrued);
		td.lastRewardsAccrued = rewardsAccrued;
	}

	function _updateRewardFor(address account, address token)
		internal
		returns (uint256)
	{
		UserData storage user = _users[account];
		UserTokenRewards storage rewards = user.rewardsFor[token];
		uint256 total = rewards.pending; // Save gas
		uint256 amountStaked = stakedBalanceOf(account, token);
		uint256 pending = _pendingRewardsFor(account, token, amountStaked);
		if (pending != 0) {
			total += pending;
			rewards.pending = total;
			user.tokensWithRewards.add(token);
		}
		rewards.arptLast = accruedRewardsPerTokenFor(token);
		return total;
	}

	function _updateAllRewardsFor(address account) internal {
		EnumerableMap.AddressToUintMap storage staked = _users[account].staked;
		for (uint256 i = 0; i < staked.length(); i++) {
			(address token, ) = staked.at(i);
			_updateRewardFor(account, token);
		}
	}
}
