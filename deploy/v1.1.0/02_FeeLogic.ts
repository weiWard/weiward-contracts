import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { salt } from '../../utils/create2';
import {
	getDeployedSushiPair,
	getDeployedSushiRouter,
} from '../../utils/sushi';
import { getDeployedWETH } from '../../utils/weth';

const version = 'v1.1.0';
const contractName = 'FeeLogic';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();
	const chainId = await getChainId();
	const deployerSigner = ethers.provider.getSigner(deployer);

	const ethtxAddr = (await deployments.get('ETHtx')).address;
	const ethtxAmmAddr = (await deployments.get('ETHtxAMM')).address;
	const ethmxMinterAddr = (await deployments.get('ETHmxMinter')).address;
	const ethtxRewardsMgrAddr = (await deployments.get('ETHtxRewardsManager'))
		.address;
	const sushiRouterAddr = await getDeployedSushiRouter(deployments, chainId);
	if (!sushiRouterAddr) {
		throw new Error('SushiV2Router02 address undefined for current network');
	}
	const wethAddr = await getDeployedWETH(deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}
	const sushiPairAddr = await getDeployedSushiPair(
		deployments,
		chainId,
		deployerSigner,
		ethtxAddr,
		wethAddr,
	);
	if (!sushiPairAddr) {
		throw new Error('SushiV2Pair address undefined for current network');
	}

	const feeRecipient = ethtxRewardsMgrAddr;
	const feeNum = 25;
	const feeDen = 1000;
	const rebaseInterval = 7200; // 2 hour limit for leeway + security
	const rebaseFeeNum = 1;
	const rebaseFeeDen = 100;

	await deploy(contractName, {
		from: deployer,
		log: true,
		args: [
			{
				owner: deployer,
				recipient: feeRecipient,
				feeRateNumerator: feeNum,
				feeRateDenominator: feeDen,
				exemptions: [
					{ account: ethmxMinterAddr, isExempt: true },
					{ account: ethtxRewardsMgrAddr, isExempt: true },
					{ account: sushiRouterAddr, isExempt: true },
				],
				rebaseInterval,
				rebaseFeeRateNum: rebaseFeeNum,
				rebaseFeeRateDen: rebaseFeeDen,
				rebaseExemptions: [
					{ account: ethtxAmmAddr, isExempt: true },
					{ account: sushiPairAddr, isExempt: true },
				],
			},
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
	'WETHv1.0.0',
	'ETHtxv1.1.0',
	'ETHtxAMMv1.0.0',
	'ETHmxMinterv1.0.0',
	'ETHtxRewardsManagerv0.3.0',
	'SushiV2Router02v0.3.0',
	'SushiV2Pairv0.3.0',
];
