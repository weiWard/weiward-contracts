import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getDeployedWETH } from '../utils/weth';
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

	const chainId = await getChainId();
	const wethAddr = await getDeployedWETH(deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const result = await deploy(contractName, {
		from: deployer,
		log: true,
		args: [deployer, defaultRecipient, wethAddr],
		deterministicDeployment: salt,
	});

	const deployerSigner = ethers.provider.getSigner(deployer);

	const feeLogic = FeeLogic__factory.connect(feeLogicAddr, deployerSigner);
	await feeLogic.setRecipient(result.address);
	await feeLogic.setExempt(result.address, true);

	const ethtxRewardsMgr = ETHtxRewardsManager__factory.connect(
		result.address,
		deployerSigner,
	);
	await ethtxRewardsMgr.setEthmxRewardsAddress(ethmxRewardsAddr);
	await ethtxRewardsMgr.setEthtxAddress(ethtxAddr);
	await ethtxRewardsMgr.setEthtxAMMAddress(ethtxAMMAddr);
	await ethtxRewardsMgr.setLPRewardsAddress(lpRewardsAddr);
};

export default func;
func.tags = [contractName];
func.dependencies = [
	'ETHmxRewards',
	'ETHtx',
	'ETHtxAMM',
	'FeeLogic',
	'LPRewards',
];
