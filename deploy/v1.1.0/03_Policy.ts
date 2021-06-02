import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { salt } from '../../utils/create2';

const version = 'v1.1.0';
const contractName = 'Policy';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer, gasOracleService } = await getNamedAccounts();

	const ethtxAddr = (await deployments.get('ETHtx')).address;
	const gasOracleAddr = (await deployments.get('GasPrice')).address;

	await deploy(contractName, {
		from: deployer,
		log: true,
		args: [deployer, gasOracleService, gasOracleAddr, ethtxAddr],
		deterministicDeployment: salt,
	});

	// Never execute twice
	return true;
};

const id = contractName + version;

export default func;
func.tags = [id, version];
func.id = id;
func.dependencies = ['GasPricev0.3.0', 'ETHtxv1.1.0'];
