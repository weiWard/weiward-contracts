/* eslint-disable no-console */
import hre from 'hardhat';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';
import { parseUnits } from '@ethersproject/units';

import { ETHtxRewardsManager__factory } from '../build/types/ethers-v5';

const { deployments, getNamedAccounts, getChainId, ethers } = hre;

(async (): Promise<void> => {
	const chainId = await getChainId();

	if (chainId == '1') {
		throw new Error('Reverting on homestead.');
	}

	const { deployer } = await getNamedAccounts();

	const signer = ethers.provider.getSigner(deployer);
	const rwdsMgrAddr = (await deployments.get('ETHtxRewardsManager')).address;
	const rwdsMgr = ETHtxRewardsManager__factory.connect(rwdsMgrAddr, signer);
	try {
		await rwdsMgr.setSharesBatch(
			[
				{
					account: '0x3f4218200fd3cb64ba46047ece77eee1e477690e',
					value: 80,
					isActive: true,
				},
				{
					account: '0x884972C11cFDE35B4860903Db89D0545c924F453',
					value: 20,
					isActive: true,
				},
			],
			{
				type: 2,
				maxPriorityFeePerGas: parseUnits('3', 9),
				maxFeePerGas: parseUnits('77', 9),
			},
		);
	} catch (err) {
		console.log(`Failed to call removeShares: ${err}`);
		return;
	}

	console.log('Removed shares');
})();
