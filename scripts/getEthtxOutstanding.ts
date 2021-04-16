/* eslint-disable no-console */
import hre from 'hardhat';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';
import { formatEther } from '@ethersproject/units';

import { ETHtxAMM__factory } from '../build/types/ethers-v5';

const { deployments, getNamedAccounts, ethers } = hre;

(async (): Promise<void> => {
	const { user } = await getNamedAccounts();
	if (!user) {
		throw new Error('User account is undefined');
	}

	const signer = ethers.provider.getSigner(user);
	const ammAddr = (await deployments.get('ETHtxAMM')).address;
	const amm = ETHtxAMM__factory.connect(ammAddr, signer);
	console.log(`Calling ETHtxAMM.ethtxOutstanding from ${user} at ${ammAddr}`);
	try {
		const outstanding = await amm.ethtxOutstanding();
		console.log(`ETHtx outstanding: ${formatEther(outstanding)}`);
	} catch (err) {
		console.log(`Failed to call ethtxOutstanding: ${err}`);
		return;
	}
})();
