import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getDeployedWETH } from '../utils/weth';
import { salt } from '../utils/create2';

const contractName = 'ETHmxRewards';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const ethmx = await deployments.get('ETHmx');
	const accrualUpdateInterval = 86400; // 24 hours

	const chainId = await getChainId();
	const wethAddr = await getDeployedWETH(deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	await deploy(contractName, {
		from: deployer,
		log: true,
		args: [deployer, ethmx.address, wethAddr, accrualUpdateInterval],
		deterministicDeployment: salt,
	});

	// Never execute twice
	return true;
};

export default func;
func.tags = [contractName];
func.id = contractName;
func.dependencies = ['ETHmx'];
