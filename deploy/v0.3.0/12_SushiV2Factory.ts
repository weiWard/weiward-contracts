import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { zeroAddress } from '../../test/helpers/address';
import { getOrDeploySushiFactory } from '../../utils/sushi';

const version = 'v0.3.0';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deployer } = await getNamedAccounts();
	const chainId = await getChainId();

	const deployerSigner = ethers.provider.getSigner(deployer);

	const sushiFactory = await getOrDeploySushiFactory(
		deployer,
		deployerSigner,
		deployments,
		chainId,
	);

	if (!sushiFactory) {
		throw new Error('SushiV2Factory address undefined for current network');
	} else if (sushiFactory.address == zeroAddress) {
		throw new Error('SushiV2Factory address is zero for current network');
	}

	// eslint-disable-next-line no-console
	console.log(`SushiV2Factory: ${sushiFactory.address}`);
};

const id = 'SushiV2Factory' + version;

export default func;
func.tags = [id, version];
func.dependencies = [];
