import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { salt } from '../../utils/create2';

const version = 'v1.0.0';
const contractName = 'ETHmxMinter';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	if (await deployments.getOrNull(contractName)) {
		throw Error(
			'You must deploy a new ETHmxMinter_Proxy, please delete ETHmxMinter.json, ETHmxMinter_Implementation.json, and ETHmxMinter_Proxy.json first',
		);
	}

	await deploy(contractName, {
		from: deployer,
		log: true,
		proxy: {
			owner: deployer,
			methodName: 'init',
			proxyContract: 'OpenZeppelinTransparentProxy',
			viaAdminContract: 'ProxyAdmin',
		},
		args: [deployer],
		deterministicDeployment: salt,
	});

	// Never execute twice
	return true;
};

const id = contractName + version;
func.tags = [id, version];
func.id = id;
func.dependencies = ['ProxyAdminv0.3.0'];

export default func;
