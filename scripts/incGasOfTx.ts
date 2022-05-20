/* eslint-disable no-console */
import hre from 'hardhat';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';
import { parseUnits } from '@ethersproject/units';

import { getGasPrice } from '../utils/blocknative';

const { getNamedAccounts, ethers } = hre;

(async (): Promise<void> => {
	const { deployer } = await getNamedAccounts();
	if (!deployer) {
		throw new Error('deployer account is undefined');
	}

	const signer = ethers.provider.getSigner(deployer);

	const txHash = '';
	const nonce = 75;
	const gasLimit = 1125355;

	const gasPrice = await getGasPrice();
	if (!gasPrice) {
		console.log('Failed to get gas price, aborting...');
		return;
	}

	const maxPriorityFeePerGas = parseUnits(
		gasPrice.maxPriorityFeePerGas.toString(),
		9,
	);
	const maxFeePerGas = parseUnits(gasPrice.maxFeePerGas.toString(), 9);

	const tx = await signer.provider.getTransaction(txHash);

	await signer.sendTransaction({
		nonce,
		type: 2,
		maxPriorityFeePerGas,
		maxFeePerGas,
		gasLimit,
		data: tx.data,
		from: tx.from,
		to: tx.to,
	});
})();
