/* eslint-disable no-console */
import hre from 'hardhat';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';

import { ETHmxRewards__factory } from '../build/types/ethers-v5';

const { deployments, getNamedAccounts, getChainId, ethers } = hre;

(async (): Promise<void> => {
	const chainId = await getChainId();

	if (chainId == '1') {
		throw new Error('Reverting on homestead.');
	}

	const { deployer } = await getNamedAccounts();

	const signer = ethers.provider.getSigner(deployer);
	const ethmxRewardsAddr = (await deployments.get('ETHmxRewards')).address;
	const ethmxRewards = ETHmxRewards__factory.connect(ethmxRewardsAddr, signer);

	const interval = 60;
	console.log(
		`Calling ETHmxRewards.setAccrualUpdateInterval(${interval}) from ${deployer} at ${ethmxRewardsAddr}`,
	);
	try {
		await ethmxRewards.setAccrualUpdateInterval(interval);
	} catch (err) {
		console.log(`Failed to call setAccrualUpdateInterval: ${err}`);
		return;
	}

	console.log('Set ETHmxRewards accrualUpdateInterval');
})();
