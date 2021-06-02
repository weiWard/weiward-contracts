import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getOrDeployWETH } from '../../utils/weth';

const version = 'v0.3.0';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId } = hre;
	const { deployer } = await getNamedAccounts();
	const chainId = await getChainId();

	const wethAddr = await getOrDeployWETH(deployer, deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	return true;
};

const id = 'WETH' + version;

export default func;
func.tags = [id, version];
func.id = id;
