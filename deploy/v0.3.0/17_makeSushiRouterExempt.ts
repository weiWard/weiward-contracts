/* eslint-disable no-console */
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getVersionedDeps } from '../../utils/deploy';
import { getDeployedSushiRouter } from '../../utils/sushi';
import { FeeLogic__factory } from '../../build/types/ethers-v5';

const version = 'v0.3.0';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;

	const { deployer } = await getNamedAccounts();

	const deployerSigner = ethers.provider.getSigner(deployer);
	const chainId = await getChainId();

	const sushiRouterAddr = await getDeployedSushiRouter(deployments, chainId);
	if (!sushiRouterAddr) {
		throw new Error('SushiV2Router02 address undefined for current network');
	}
	const feeLogic = FeeLogic__factory.connect(
		(await deployments.get('FeeLogic')).address,
		deployerSigner,
	);

	let isExempt = await feeLogic.isExempt(sushiRouterAddr);
	if (isExempt) {
		console.log('Skipping makeSushiRouterExempt script');

		return true;
	}

	await feeLogic.setExempt(sushiRouterAddr, true);

	isExempt = await feeLogic.isExempt(sushiRouterAddr);
	if (isExempt) {
		console.log(`SushiV2Router at ${sushiRouterAddr} is now exempt from fees`);
	} else {
		console.error('SushV2Router was not made exempt');
		return false;
	}

	console.log('Completed makeSushiRouterExempt script.');

	// Never execute twice
	return true;
};

const id = 'makeSushiRouterExempt' + version;

export default func;
func.tags = [id, version];
func.id = id;
func.dependencies = getVersionedDeps(['SushiV2Router02', 'FeeLogic'], version);
