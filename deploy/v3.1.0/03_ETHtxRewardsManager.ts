import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { deployOrUpgrade } from '../../utils/deploy';
import { salt } from '../../utils/create2';

const version = 'v3.1.0';
const contractName = 'ETHtxRewardsManager';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	await deployOrUpgrade(contractName, salt, hre);
	return true;
};

const id = contractName + version;
func.tags = [id, version];
func.id = id;
func.dependencies = ['ProxyAdminv0.3.0'];

export default func;
