import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getOrDeployWETH } from '../utils/weth';
import {
	ETHtxRewardsManager__factory,
	FeeLogic__factory,
} from '../build/types/ethers-v5';
import { salt } from '../utils/create2';

const contractName = 'ETHtxRewardsManager';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const ethmxRewardsAddr = (await deployments.get('ETHmxRewards')).address;
	const ethtxAddr = (await deployments.get('ETHtx')).address;
	const ethtxAMMAddr = (await deployments.get('ETHtxAMM')).address;
	const feeLogicAddr = (await deployments.get('FeeLogic')).address;
	const lpRewardsAddr = (await deployments.get('LPRewards')).address;

	const defaultRecipient = ethmxRewardsAddr;
	const defaultShares = 10;
	const ethmxRewardsShares = 45 + defaultShares;
	const lpRewardsShares = 20;

	const chainId = await getChainId();
	const wethAddr = await getOrDeployWETH(deployer, deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const result = await deploy(contractName, {
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

	if (result.newlyDeployed) {
		const deployerSigner = ethers.provider.getSigner(deployer);

		const ethtxRewardsMgr = ETHtxRewardsManager__factory.connect(
			result.address,
			deployerSigner,
		);
		await ethtxRewardsMgr.ethtxRewardsManagerPostInit({
			defaultRecipient,
			rewardsToken: wethAddr,
			ethmxRewards: ethmxRewardsAddr,
			ethtx: ethtxAddr,
			ethtxAMM: ethtxAMMAddr,
			lpRewards: lpRewardsAddr,
		});

		const feeLogic = FeeLogic__factory.connect(feeLogicAddr, deployerSigner);
		await feeLogic.setRecipient(result.address);
		await feeLogic.setExempt(result.address, true);

		const sharesAccounts = [ethmxRewardsAddr, lpRewardsAddr];
		const sharesValues = [ethmxRewardsShares, lpRewardsShares];
		const sharesActive = [true, true];
		if (defaultRecipient !== ethmxRewardsAddr) {
			sharesAccounts.push(defaultRecipient);
			sharesValues.push(defaultShares);
			sharesActive.push(true);
		}

		await ethtxRewardsMgr.setSharesBatch(
			sharesAccounts,
			sharesValues,
			sharesActive,
		);
	}

	// Never execute twice
	return true;
};

export default func;
func.tags = [contractName];
func.id = contractName;
func.dependencies = [
	'ProxyAdmin',
	'ETHmxRewards',
	'ETHtx',
	'ETHtxAMM',
	'FeeLogic',
	'LPRewards',
];
