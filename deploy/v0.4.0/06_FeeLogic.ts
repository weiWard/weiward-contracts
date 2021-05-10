import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { salt } from '../../utils/create2';
import { getDeployedSushiRouter } from '../../utils/sushi';

const version = 'v0.4.0';
const contractName = 'FeeLogic';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();
	const chainId = await getChainId();

	const ethtxAmmAddr = (await deployments.get('ETHtxAMM')).address;
	const ethmxMinterAddr = (await deployments.get('ETHmxMinter')).address;
	const ethtxRewardsMgrAddr = (await deployments.get('ETHtxRewardsManager'))
		.address;
	const sushiRouterAddr = await getDeployedSushiRouter(deployments, chainId);
	if (!sushiRouterAddr) {
		throw new Error('SushiV2Router02 address undefined for current network');
	}

	const feeRecipient = ethtxRewardsMgrAddr;
	const feeNum = 75;
	const feeDen = 1000;

	await deploy(contractName, {
		from: deployer,
		log: true,
		args: [
			deployer,
			feeRecipient,
			feeNum,
			feeDen,
			[
				{ account: ethtxAmmAddr, isExempt: true },
				{ account: ethmxMinterAddr, isExempt: true },
				{ account: ethtxRewardsMgrAddr, isExempt: true },
				{ account: sushiRouterAddr, isExempt: true },
			],
		],
		deterministicDeployment: salt,
	});

	// Never execute twice
	return true;
};

const id = contractName + version;

export default func;
func.tags = [id, version];
func.id = id;
func.dependencies = [
	'ETHtxAMMv0.4.0',
	'ETHmxMinterv0.3.0',
	'ETHtxRewardsManagerv0.3.0',
	'SushiV2Router02v0.3.0',
];
