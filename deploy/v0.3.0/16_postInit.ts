import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { parseEther } from '@ethersproject/units';

import { getVersionedDeps } from '../../utils/deploy';
import { getDeployedWETH } from '../../utils/weth';
import {
	getDeployedSushiPair,
	getDeployedSushiRouter,
} from '../../utils/sushi';
import { parseGwei } from '../../test/helpers/conversions';
import {
	ETHmx__factory,
	ETHmxMinter__factory,
	ETHmxRewards__factory,
	ETHtx__factory,
	ETHtxAMM__factory,
	ETHtxRewardsManager__factory,
	FeeLogic__factory,
	LPRewards__factory,
} from '../../build/types/ethers-v5';

const version = 'v0.3.0';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;

	const { deployer } = await getNamedAccounts();

	const deployerSigner = ethers.provider.getSigner(deployer);
	const chainId = await getChainId();

	const wethAddr = await getDeployedWETH(deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const gasOracle = await deployments.get('GasPrice');
	const feeLogic = FeeLogic__factory.connect(
		(await deployments.get('FeeLogic')).address,
		deployerSigner,
	);
	const ethtx = ETHtx__factory.connect(
		(await deployments.get('ETHtx')).address,
		deployerSigner,
	);
	const ethmx = ETHmx__factory.connect(
		(await deployments.get('ETHmx')).address,
		deployerSigner,
	);
	const ethtxAmm = ETHtxAMM__factory.connect(
		(await deployments.get('ETHtxAMM')).address,
		deployerSigner,
	);
	const ethmxMinter = ETHmxMinter__factory.connect(
		(await deployments.get('ETHmxMinter')).address,
		deployerSigner,
	);
	const ethmxRewards = ETHmxRewards__factory.connect(
		(await deployments.get('ETHmxRewards')).address,
		deployerSigner,
	);
	const lpRewards = LPRewards__factory.connect(
		(await deployments.get('LPRewards')).address,
		deployerSigner,
	);
	const ethtxRewardsMgr = ETHtxRewardsManager__factory.connect(
		(await deployments.get('ETHtxRewardsManager')).address,
		deployerSigner,
	);
	// Sushi router
	const sushiRouterAddr = await getDeployedSushiRouter(deployments, chainId);
	if (!sushiRouterAddr) {
		throw new Error('SushiV2Router02 address undefined for current network');
	}
	// Sushi pair
	const sushiPairAddr = await getDeployedSushiPair(
		deployments,
		chainId,
		deployerSigner,
		ethtx.address,
		wethAddr,
	);
	if (!sushiPairAddr) {
		throw new Error('SushiV2Pair address undefined for current network');
	}
	const valuePerSushi = await deployments.get('ValuePerSushi');

	await ethtx.postInit({
		feeLogic: feeLogic.address,
		minter: ethmxMinter.address,
	});

	await ethmx.setMinter(ethmxMinter.address);

	await ethtxAmm.postInit({
		ethtx: ethtx.address,
		gasOracle: gasOracle.address,
		weth: wethAddr,
		targetCRatioNum: 2,
		targetCRatioDen: 1,
	});

	await ethmxMinter.postInit({
		ethmx: ethmx.address,
		ethtx: ethtx.address,
		ethtxAMM: ethtxAmm.address,
		weth: wethAddr,
		mintGasPrice: parseGwei('1000'),
		roiNumerator: 5,
		roiDenominator: 1,
		earlyThreshold: parseEther('1000'),
		lpShareNumerator: 25,
		lpShareDenominator: 100,
		lps: [sushiRouterAddr],
		lpRecipient: deployer,
	});

	await ethmxRewards.postInit({
		ethmx: ethmx.address,
		weth: wethAddr,
		accrualUpdateInterval: 43200, // 12 hours
	});

	await lpRewards.setRewardsToken(wethAddr);
	await lpRewards.addToken(sushiPairAddr, valuePerSushi.address);

	const defaultRecipient = deployer;
	await ethtxRewardsMgr.ethtxRewardsManagerPostInit({
		defaultRecipient,
		rewardsToken: wethAddr,
		ethmxRewards: ethmxRewards.address,
		ethtx: ethtx.address,
		ethtxAMM: ethtxAmm.address,
		lpRewards: lpRewards.address,
		shares: [
			{
				account: defaultRecipient,
				value: 10,
				isActive: true,
			},
			{
				account: ethmxRewards.address,
				value: 45,
				isActive: true,
			},
			{
				account: lpRewards.address,
				value: 20,
				isActive: true,
			},
		],
	});

	// eslint-disable-next-line no-console
	console.log('Completed postInit script.');

	// Never execute twice
	return true;
};

const id = 'postInit' + version;

export default func;
func.tags = [id, version];
func.id = id;
func.dependencies = getVersionedDeps(
	[
		'ProxyAdmin',
		'WETH',
		'GasPrice',
		'ETHtx',
		'ETHmx',
		'ETHtxAMM',
		'ETHmxMinter',
		'ETHmxRewards',
		'LPRewards',
		'ETHtxRewardsManager',
		'SushiV2Router02',
		'SushiV2Pair',
		'FeeLogic',
		'ValuePerSushi',
	],
	version,
);
