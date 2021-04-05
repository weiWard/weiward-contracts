import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { parseUnits } from 'ethers/lib/utils';

import { salt } from '../utils/create2';

const contractName = 'GasPrice';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const updateThreshold = 32400; // 9 hours
	const gasPrice = parseUnits('200', 9);

	await deploy(contractName, {
		from: deployer,
		log: true,
		args: [deployer, updateThreshold, gasPrice],
		deterministicDeployment: salt,
	});
};

export default func;
func.tags = [contractName];
