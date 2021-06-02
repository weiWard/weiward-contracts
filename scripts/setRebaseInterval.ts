/* eslint-disable no-console */
import hre from 'hardhat';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';

import { FeeLogic__factory } from '../build/types/ethers-v5';

const { deployments, getNamedAccounts, getChainId, ethers } = hre;

(async (): Promise<void> => {
	const chainId = await getChainId();

	if (chainId == '1') {
		throw new Error('Reverting on homestead.');
	}

	const { deployer } = await getNamedAccounts();

	const signer = ethers.provider.getSigner(deployer);
	const feeLogicAddr = (await deployments.get('FeeLogic')).address;
	const feeLogic = FeeLogic__factory.connect(feeLogicAddr, signer);

	const interval = 0;
	console.log(
		`Calling FeeLogic.setRebaseInterval(${interval}) from ${deployer} at ${feeLogicAddr}`,
	);
	try {
		await feeLogic.setRebaseInterval(interval);
	} catch (err) {
		console.log(`Failed to call setRebaseInterval: ${err}`);
		return;
	}

	console.log('Set FeeLogic rebaseInterval');
})();
