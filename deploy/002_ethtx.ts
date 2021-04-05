import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { zeroAddress } from '../test/helpers/address';
import { salt } from '../utils/create2';

const contractName = 'ETHtx';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const feeLogic = await deployments.get('FeeLogic');

	await deploy(contractName, {
		from: deployer,
		log: true,
		proxy: {
			owner: deployer,
			methodName: 'init',
			proxyContract: 'OpenZeppelinTransparentProxy',
			viaAdminContract: 'DefaultProxyAdmin',
		},
		args: [deployer, feeLogic.address, zeroAddress],
		deterministicDeployment: salt,
	});
};

export default func;
func.tags = [contractName];
func.dependencies = ['FeeLogic'];
