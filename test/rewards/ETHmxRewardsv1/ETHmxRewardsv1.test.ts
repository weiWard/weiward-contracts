import * as modules from './modules';

describe('ETHmxRewardsv1', function () {
	const addTest = (name: string, fn: () => void): void => {
		describe(name, fn.bind(this));
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const addTestOnly = (name: string, fn: () => void): void => {
		describe.only(name, fn.bind(this));
	};

	addTest('constructor', modules.constructor);
	addTest('init', modules.init);
	addTest('postInit', modules.postInit);
	addTest('exit', modules.exit);
	addTest('pause', modules.pause);
	addTest('receive', modules.receive);
	addTest('recoverUnredeemableRewards', modules.recoverUnredeemableRewards);
	addTest('recoverUnstaked', modules.recoverUnstaked);
	addTest('recoverUnsupportedERC20', modules.recoverUnsupportedERC20);
	addTest('redeemAllRewards', modules.redeemAllRewards);
	addTest('redeemReward', modules.redeemReward);
	addTest('setAccrualUpdateInterval', modules.setAccrualUpdateInterval);
	addTest('setEthmx', modules.setEthmx);
	addTest('setWeth', modules.setWeth);
	addTest('stake', modules.stake);
	addTest('totalRewardsAccrued', modules.totalRewardsAccrued);
	addTest('unpause', modules.unpause);
	addTest('unstake', modules.unstake);
	addTest('unstakeAll', modules.unstakeAll);
	addTest('updateAccrual', modules.updateAccrual);
	addTest('updateReward', modules.updateReward);
});
