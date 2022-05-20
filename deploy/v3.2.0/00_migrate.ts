import { DeployFunction } from 'hardhat-deploy/types';

const version = 'v3.2.0';

const func: DeployFunction = async function () {
	return true;
};

const id = 'migrate' + version;
func.tags = [id, version];
func.id = id;

func.dependencies = [
	'ProxyAdminv0.3.0',
	'WETHv1.0.0',
	'GasPricev0.3.0',
	'ETHtxv1.1.0',
	'ETHmxv3.2.0',
	'ETHtxAMMv3.1.0',
	'ETHmxMinterv3.1.0',
	'ETHmxRewardsv3.0.0',
	'ETHtxRewardsManagerv3.1.0',
	'LPRewardsv3.1.0',
	'FeeLogicv1.1.0',
	'Policyv1.1.0',
	'postInitv3.2.0',
];

export default func;
