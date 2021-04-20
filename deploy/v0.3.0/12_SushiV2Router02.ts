import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getVersionedDeps } from '../../utils/deploy';
import { getDeployedWETH } from '../../utils/weth';
import { zeroAddress } from '../../test/helpers/address';
import { getOrDeploySushiRouter } from '../../utils/sushi';

const version = 'v0.3.0';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deployer } = await getNamedAccounts();
	const chainId = await getChainId();

	const wethAddr = await getDeployedWETH(deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const deployerSigner = ethers.provider.getSigner(deployer);

	const sushiRouterAddr = await getOrDeploySushiRouter(
		deployer,
		deployerSigner,
		deployments,
		chainId,
		wethAddr,
	);
	if (!sushiRouterAddr) {
		throw new Error('SushiV2Router02 address undefined for current network');
	} else if (sushiRouterAddr == zeroAddress) {
		throw new Error('SushiV2Router02 address is zero for current network');
	}

	// eslint-disable-next-line no-console
	console.log(`SushiV2Router02: ${sushiRouterAddr}`);
};

const id = 'SushiV2Router02' + version;

export default func;
func.tags = [id, version];
func.dependencies = getVersionedDeps(['WETH', 'SushiV2Factory'], version);
