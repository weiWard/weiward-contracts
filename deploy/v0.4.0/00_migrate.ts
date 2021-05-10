import { DeployFunction } from 'hardhat-deploy/types';

const version = 'v0.4.0';

const func: DeployFunction = async function () {
	return true;
};

const id = 'migrate' + version;
func.tags = [id, version];
func.id = id;

func.dependencies = [
	'ProxyAdminv0.3.0',
	'WETHv0.4.0',
	'GasPricev0.3.0',
	'ETHtxv0.3.0',
	'ETHmxv0.3.0',
	'ETHtxAMMv0.4.0',
	'ETHmxMinterv0.4.0',
	'ETHmxRewardsv0.4.0',
	'LPRewardsv0.4.0',
	'ETHtxRewardsManagerv0.3.0',
	'SushiV2Factoryv0.3.0',
	'SushiV2Router02v0.3.0',
	'SushiV2Pairv0.3.0',
	'FeeLogicv0.4.0',
	'ValuePerSushiv0.3.0',
	'postInitv0.4.0',
];

export default func;
