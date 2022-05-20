/* eslint-disable no-console */
import hre from 'hardhat';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';
import schedule from 'node-schedule';
import { parseUnits } from '@ethersproject/units';

import { ETHtxAMM__factory } from '../build/types/ethers-v5';

import { getGasPrice } from '../utils/blocknative';

const { deployments, getNamedAccounts, ethers } = hre;

(async (): Promise<void> => {
	const { deployer } = await getNamedAccounts();
	if (!deployer) {
		throw new Error('deployer account is undefined');
	}

	const signer = ethers.provider.getSigner(deployer);
	const ethtxAmmAddr = (await deployments.get('ETHtxAMM')).address;
	const ethtxAmm = ETHtxAMM__factory.connect(ethtxAmmAddr, signer);

	const date = new Date(2022, 3, 30, 18, 5, 0);

	console.log(
		`Scheduled to call ETHtxAMM.pause from ${deployer} at ${ethtxAmmAddr} on ${date.toISOString()}`,
	);

	schedule.scheduleJob(date, async function () {
		console.log(`Called at ${new Date().toISOString()}`);
		try {
			const gp = await getGasPrice();
			if (!gp) {
				console.log('Failed to get gas price, aborting...');
				return;
			}

			const maxPriorityFeePerGas = parseUnits(
				gp.maxPriorityFeePerGas.toString(),
				9,
			);
			const maxFeePerGas = parseUnits(gp.maxFeePerGas.toString(), 9);

			await ethtxAmm.pause({
				type: 2,
				maxPriorityFeePerGas,
				maxFeePerGas,
			});
		} catch (err) {
			console.log(`Failed to call pause: ${err}`);
			return;
		}
		console.log('Finished calling ETHtxAMM pause');
	});
})();
