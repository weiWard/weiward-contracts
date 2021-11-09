import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { salt } from '../../utils/create2';
import { getDeployedWETH } from '../../utils/weth';

const version = 'v1.1.0';
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
	const wethAddr = await getDeployedWETH(deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const feeRecipient = ethtxRewardsMgrAddr;
	const feeNum = 75;
	const feeDen = 1000;
	const rebaseInterval = 7200; // 2 hour limit for leeway + security
	const rebaseFeeNum = 2;
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
				],
				rebaseInterval,
				rebaseFeeRateNum: rebaseFeeNum,
				rebaseFeeRateDen: rebaseFeeDen,
				rebaseExemptions: [{ account: ethtxAmmAddr, isExempt: true }],
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
	'ETHtxAMMv1.2.0',
	'ETHmxMinterv1.0.0',
	'ETHtxRewardsManagerv0.3.0',
];
