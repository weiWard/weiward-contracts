import { DeployFunction } from 'hardhat-deploy/types';

const version = 'v1.0.0';

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
	'ETHtxv0.3.0',
	'ETHmxv0.3.0',
	'ETHtxAMMv1.0.0',
	'ETHmxMinterv1.0.0',
	'ETHmxRewardsv1.0.0',
	'LPRewardsv1.0.0',
	'ETHtxRewardsManagerv0.3.0',
	'SushiV2Factoryv0.3.0',
	'SushiV2Router02v0.3.0',
	'SushiV2Pairv0.3.0',
	'FeeLogicv1.0.0',
	'ValuePerSushiv0.3.0',
	'postInitv1.0.0',
];

export default func;
