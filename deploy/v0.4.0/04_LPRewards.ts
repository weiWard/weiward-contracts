import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { deployOrUpgrade, getVersionedDeps } from '../../utils/deploy';
import { salt } from '../../utils/create2';

const version = 'v0.4.0';
const contractName = 'LPRewards';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	await deployOrUpgrade(contractName, salt, hre);
	return true;
};

const id = contractName + version;
func.tags = [id, version];
func.id = id;
func.dependencies = getVersionedDeps(['ProxyAdmin'], 'v0.3.0');

export default func;
