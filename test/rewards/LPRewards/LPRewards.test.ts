import * as modules from './modules';

describe.only('LPRewards', function () {
	const addTest = (name: string, fn: () => void): void => {
		describe(name, fn.bind(this));
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const addTestOnly = (name: string, fn: () => void): void => {
		describe.only(name, fn.bind(this));
	};

	addTest('constructor', modules.constructor);
	addTestOnly('accruedRewardsPerTokenFor', modules.accruedRewardsPerTokenFor);
	addTest(
		'accruedRewardsPerTokenPaidFor',
		modules.accruedRewardsPerTokenPaidFor,
	);
	addTest('addToken', modules.addToken);
	addTest('changeTokenValueImpl', modules.changeTokenValueImpl);
	addTest(
		'currentAccruedRewardsPerTokenFor',
		modules.currentAccruedRewardsPerTokenFor,
	);
	addTest('currentRewardsBalanceOf', modules.currentRewardsBalanceOf);
	addTest('currentRewardsBalanceOfFor', modules.currentRewardsBalanceOfFor);
	addTest('currentSharesFor', modules.currentSharesFor);
	addTest('currentSharesOf', modules.currentSharesOf);
	addTest('currentSharesOfFor', modules.currentSharesOfFor);
	addTest('currentSharesPerTokenFor', modules.currentSharesPerTokenFor);
	addTest(
		'currentTotalRewardsAccruedFor',
		modules.currentTotalRewardsAccruedFor,
	);
	addTest('currentTotalShares', modules.currentTotalShares);
	addTest('exit', modules.exit);
	addTest('exitFrom', modules.exitFrom);
	addTest('numStakingTokens', modules.numStakingTokens);
	addTest('pause', modules.pause);
	addTest('recoverUnstaked', modules.recoverUnstaked);
	addTest('redeemAllRewards', modules.redeemAllRewards);
	addTest('redeemAllRewardsFrom', modules.redeemAllRewardsFrom);
	addTest('redeemReward', modules.redeemReward);
	addTest('redeemRewardFrom', modules.redeemRewardFrom);
	addTest('removeToken', modules.removeToken);
	addTest('rewardsBalanceOf', modules.rewardsBalanceOf);
	addTest('rewardsFor', modules.rewardsFor);
	addTest('rewardsRedeemedBy', modules.rewardsRedeemedBy);
	addTest('rewardsRedeemedByFor', modules.rewardsRedeemedByFor);
	addTest('rewardsToken', modules.rewardsToken);
	addTest('stake', modules.stake);
	addTest('stakedBalanceOfFor', modules.stakedBalanceOfFor);
	addTest('stakingTokenAt', modules.stakingTokenAt);
	addTest('supportsStakingToken', modules.supportsStakingToken);
	addTest('totalRewardsAccrued', modules.totalRewardsAccrued);
	addTest('totalRewardsAccruedFor', modules.totalRewardsAccruedFor);
	addTest('totalRewardsRedeemed', modules.totalRewardsRedeemed);
	addTest('totalRewardsRedeemedFor', modules.totalRewardsRedeemedFor);
	addTest('totalStakedFor', modules.totalStakedFor);
	addTest('unpause', modules.unpause);
	addTest('unstake', modules.unstake);
	addTest('unstakeAllFrom', modules.unstakeAllFrom);
	addTest('updateReward', modules.updateReward);
	addTest('updateRewardFor', modules.updateRewardFor);
	addTest('updateTokenRewards', modules.updateTokenRewards);
	addTest('valuePerTokenImplFor', modules.valuePerTokenImplFor);
});
