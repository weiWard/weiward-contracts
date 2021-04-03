import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const contractName = 'ContextFacet';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	await deploy(contractName, {
		from: deployer,
		log: true,
	});
};

export default func;
func.tags = [contractName, 'facets'];
func.dependencies = [];
