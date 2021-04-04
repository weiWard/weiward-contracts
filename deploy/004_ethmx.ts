import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { zeroAddress } from '../test/helpers/address';

const contractName = 'ETHmx';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	await deploy(contractName, {
		from: deployer,
		log: true,
		proxy: {
			methodName: 'init',
			proxyContract: 'OpenZeppelinTransparentProxy',
			viaAdminContract: 'DefaultProxyAdmin',
		},
		args: [zeroAddress],
	});
};

export default func;
func.tags = [contractName];
func.dependencies = [];
