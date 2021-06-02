/* eslint-disable no-console */
import hre from 'hardhat';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';
import { Contract } from '@ethersproject/contracts';
import { Zero } from '@ethersproject/constants';

import {
	GasPrice__factory,
	ETHmx__factory,
	ETHmxMinter__factory,
	ETHmxRewards__factory,
	ETHtx__factory,
	ETHtxAMM__factory,
	ETHtxRewardsManager__factory,
	FeeLogic__factory,
	LPRewards__factory,
} from '../build/types/ethers-v5';
import ProxyAdminAbi from '../build/abi/ProxyAdmin.json';
import { hexZeroPad } from '@ethersproject/bytes';

const { deployments, getNamedAccounts, getChainId, ethers } = hre;

(async (): Promise<void> => {
	const chainId = await getChainId();

	if (chainId == '1') {
		throw new Error('Reverting on homestead.');
	}

	const { deployer, defaultRewardsRecipient } = await getNamedAccounts();
	const signer = ethers.provider.getSigner(deployer);

	const proxyAdmin = new Contract(
		(await deployments.get('ProxyAdmin')).address,
		ProxyAdminAbi,
		signer,
	);
	const oracle = GasPrice__factory.connect(
		(await deployments.get('GasPrice')).address,
		signer,
	);
	const feeLogic = FeeLogic__factory.connect(
		(await deployments.get('FeeLogic')).address,
		signer,
	);
	const ethtx = ETHtx__factory.connect(
		(await deployments.get('ETHtx')).address,
		signer,
	);
	const ethtxImpl = ETHtx__factory.connect(
		(await deployments.get('ETHtx_Implementation')).address,
		signer,
	);
	const ethmx = ETHmx__factory.connect(
		(await deployments.get('ETHmx')).address,
		signer,
	);
	const ethmxImpl = ETHmx__factory.connect(
		(await deployments.get('ETHmx_Implementation')).address,
		signer,
	);
	const ethtxAmm = ETHtxAMM__factory.connect(
		(await deployments.get('ETHtxAMM')).address,
		signer,
	);
	const ethtxAmmImpl = ETHtxAMM__factory.connect(
		(await deployments.get('ETHtxAMM_Implementation')).address,
		signer,
	);
	const ethmxMinter = ETHmxMinter__factory.connect(
		(await deployments.get('ETHmxMinter')).address,
		signer,
	);
	const ethmxMinterImpl = ETHmxMinter__factory.connect(
		(await deployments.get('ETHmxMinter_Implementation')).address,
		signer,
	);
	const ethmxRewards = ETHmxRewards__factory.connect(
		(await deployments.get('ETHmxRewards')).address,
		signer,
	);
	const ethmxRewardsImpl = ETHmxRewards__factory.connect(
		(await deployments.get('ETHmxRewards_Implementation')).address,
		signer,
	);
	const lpRewards = LPRewards__factory.connect(
		(await deployments.get('LPRewards')).address,
		signer,
	);
	const lpRewardsImpl = LPRewards__factory.connect(
		(await deployments.get('LPRewards_Implementation')).address,
		signer,
	);
	const ethtxRewardsMgr = ETHtxRewardsManager__factory.connect(
		(await deployments.get('ETHtxRewardsManager')).address,
		signer,
	);
	const ethtxRewardsMgrImpl = ETHtxRewardsManager__factory.connect(
		(await deployments.get('ETHtxRewardsManager_Implementation')).address,
		signer,
	);

	let gasUsed = Zero;

	console.log(
		`Granting DEFAULT_ADMIN_ROLE of GasPrice at ${oracle.address} to ${defaultRewardsRecipient} from ${deployer}`,
	);
	try {
		const adminRole = hexZeroPad('0x0', 32);
		const tx = await oracle.grantRole(adminRole, defaultRewardsRecipient);
		gasUsed = gasUsed.add((await tx.wait()).gasUsed);
		// tx = await oracle.renounceRole(adminRole, deployer);
		// gasUsed = gasUsed.add((await tx.wait()).gasUsed);
	} catch (err) {
		console.log(`Failed to call grantRole: ${err}`);
		return;
	}

	const contracts = new Map<string, Contract>([
		['ETHmx', ethmx],
		['ETHmx_Implementation', ethmxImpl],
		['ETHmxMinter', ethmxMinter],
		['ETHmxMinter_Implementation', ethmxMinterImpl],
		['ETHmxRewards', ethmxRewards],
		['ETHmxRewards_Implementation', ethmxRewardsImpl],
		['ETHtx', ethtx],
		['ETHtx_Implementation', ethtxImpl],
		['ETHtxAMM', ethtxAmm],
		['ETHtxAMM_Implementation', ethtxAmmImpl],
		['ETHtxRewardsManager', ethtxRewardsMgr],
		['ETHtxRewardsManager_Implementation', ethtxRewardsMgrImpl],
		['FeeLogic', feeLogic],
		['LPRewards', lpRewards],
		['LPRewards_Implementation', lpRewardsImpl],
		['ProxyAdmin', proxyAdmin],
	]);

	for (const [name, contract] of contracts) {
		console.log(
			`Transferring ownership of ${name} at ${contract.address} to ${defaultRewardsRecipient} from ${deployer}`,
		);
		try {
			const tx = await contract.transferOwnership(defaultRewardsRecipient);
			gasUsed = gasUsed.add((await tx.wait()).gasUsed);
		} catch (err) {
			console.log(`Failed to call transferOwnership: ${err}`);
			return;
		}
	}

	console.log(`total gas used: ${gasUsed.toString()}`);

	console.log('Finished transferring ownership.');
})();
