import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getOrDeployWETH } from '../utils/weth';
import { salt } from '../utils/create2';

const contractName = 'LPRewards';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const chainId = await getChainId();
	const wethAddr = await getOrDeployWETH(deployer, deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	await deploy(contractName, {
		from: deployer,
		log: true,
		args: [deployer, wethAddr],
		deterministicDeployment: salt,
	});

	// Never execute twice
	return true;
};

export default func;
func.tags = [contractName];
func.id = contractName;
func.dependencies = ['ETHtx'];
