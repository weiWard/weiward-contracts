import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { salt } from '../utils/create2';

const contractName = 'ProxyAdmin';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	await deploy(contractName, {
		from: deployer,
		log: true,
		args: [deployer],
		deterministicDeployment: salt,
	});

	// Never execute twice
	return true;
};

export default func;
func.tags = [contractName];
func.id = contractName;
