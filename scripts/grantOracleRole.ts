/* eslint-disable no-console */
import hre from 'hardhat';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';
import { solidityKeccak256 } from 'ethers/lib/utils';

import { GasPrice__factory } from '../build/types/ethers-v5';

const { deployments, getNamedAccounts, getChainId, ethers } = hre;

(async (): Promise<void> => {
	const chainId = await getChainId();

	if (chainId == '1') {
		throw new Error('Reverting on homestead.');
	}

	const { deployer } = await getNamedAccounts();

	const signer = ethers.provider.getSigner(deployer);
	const oracle = GasPrice__factory.connect(
		(await deployments.get('GasPrice')).address,
		signer,
	);
	const oracleRole = solidityKeccak256(['string'], ['ORACLE_ROLE']);

	console.log(
		`Granting ORACLE_ROLE to ${deployer} from ${deployer} at ${oracle.address}`,
	);
	try {
		await oracle.grantRole(oracleRole, deployer);
	} catch (err) {
		console.log(`Failed to call grantRole: ${err}`);
		return;
	}

	console.log('Granted oracle role');
})();
