import * as modules from './modules';

describe('LPRewardsv1', function () {
	const addTest = (name: string, fn: () => void): void => {
		describe(name, fn.bind(this));
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const addTestOnly = (name: string, fn: () => void): void => {
		describe.only(name, fn.bind(this));
	};

	addTest('constructor', modules.constructor);
	addTest('init', modules.init);
	addTest('addToken', modules.addToken);
	addTest('changeTokenValueImpl', modules.changeTokenValueImpl);
	addTest('exit', modules.exit);
	addTest('exitFrom', modules.exitFrom);
	addTest('pause', modules.pause);
	addTest('receive', modules.receive);
	addTest('recoverUnredeemableRewards', modules.recoverUnredeemableRewards);
	addTest('recoverUnstaked', modules.recoverUnstaked);
	addTest('redeemAllRewards', modules.redeemAllRewards);
	addTest('redeemAllRewardsFrom', modules.redeemAllRewardsFrom);
	addTest('redeemReward', modules.redeemReward);
	addTest('redeemRewardFrom', modules.redeemRewardFrom);
	addTest('removeToken', modules.removeToken);
	addTest('setRewardsToken', modules.setRewardsToken);
	addTest('sharesFor', modules.sharesFor);
	addTest('sharesPerToken', modules.sharesPerToken);
	addTest('stake', modules.stake);
	addTest('totalRewardsAccrued', modules.totalRewardsAccrued);
	addTest('unpause', modules.unpause);
	addTest('unstake', modules.unstake);
	addTest('unstakeAll', modules.unstakeAll);
	addTest('unstakeAllFrom', modules.unstakeAllFrom);
	addTest('updateAccrual', modules.updateAccrual);
	addTest('updateReward', modules.updateReward);
	addTest('updateRewardFor', modules.updateRewardFor);
});
