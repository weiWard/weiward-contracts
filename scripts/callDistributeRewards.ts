/* eslint-disable no-console */
import hre from 'hardhat';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';

import { ETHtxRewardsManager__factory } from '../build/types/ethers-v5';

import { getGasPrice } from '../utils/blocknative';

const { deployments, getNamedAccounts, getChainId, ethers } = hre;

(async (): Promise<void> => {
	const chainId = await getChainId();

	if (chainId == '1') {
		throw new Error('Reverting on homestead.');
	}

	const { user } = await getNamedAccounts();
	if (!user) {
		throw new Error('User account is undefined');
	}

	const signer = ethers.provider.getSigner(user);
	const ethtxRewardsMgrAddr = (await deployments.get('ETHtxRewardsManager'))
		.address;
	const ethtxRewardsMgr = ETHtxRewardsManager__factory.connect(
		ethtxRewardsMgrAddr,
		signer,
	);
	console.log(
		`Calling ETHtxRewardsManager.distributeRewards from ${user} at ${ethtxRewardsMgrAddr}`,
	);
	try {
		const gp = await getGasPrice();
		if (!gp) {
			console.log('Failed to get gas price, aborting...');
			return;
		}
		await ethtxRewardsMgr.distributeRewards({
			type: 2,
			maxPriorityFeePerGas: gp.maxPriorityFeePerGas,
			maxFeePerGas: gp.maxFeePerGas,
		});
	} catch (err) {
		console.log(`Failed to call distributeRewards: ${err}`);
		return;
	}

	console.log('Finished calling ETHtxRewardsManager distributeRewards');
})();
