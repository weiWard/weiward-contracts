/* eslint-disable no-console */
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import fs from 'fs';
import path from 'path';
import { Contract } from '@ethersproject/contracts';

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

const version = 'v1.0.0';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	// Skip this if already done
	let migrations: Record<string, number> = {};
	try {
		migrations = JSON.parse(
			fs
				.readFileSync(
					path.join(
						hre.config.paths.deployments,
						hre.network.name,
						'.migrations.json',
					),
				)
				.toString(),
		);
		// eslint-disable-next-line no-empty
	} catch (e) {}

	const { deployments, getNamedAccounts, getChainId, ethers } = hre;

	const {
		deployer,
		defaultRewardsRecipient,
		lpRecipient,
	} = await getNamedAccounts();

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

	const ethmxMinterArgs = {
		ethmx: ethmx.address,
		ethtx: ethtx.address,
		ethtxAMM: ethtxAmm.address,
		weth: wethAddr,
		ethmxMintParams: {
			cCapNum: 10,
			cCapDen: 1,
			zetaFloorNum: 2,
			zetaFloorDen: 1,
			zetaCeilNum: 4,
			zetaCeilDen: 1,
		},
		ethtxMintParams: {
			minMintPrice: parseGwei('50'),
			mu: 5,
			lambda: 4,
		},
		lpShareNumerator: 25,
		lpShareDenominator: 100,
		lps: [sushiRouterAddr],
		lpRecipient,
	};

	if (migrations['postInitv0.3.0']) {
		console.log('Migrating variables from v0.3.0...');
		await ethtx.setFeeLogic(feeLogic.address);
		await ethmxMinter.postInit(ethmxMinterArgs);
		console.log('Completed migration to v1.0.0.');
		return true;
	}

	await ethtx.postInit({
		feeLogic: feeLogic.address,
		minters: [ethmxMinter.address],
		rebasers: [],
	});

	await ethmx.setMinter(ethmxMinter.address);

	await (ethtxAmm as Contract).postInit({
		ethtx: ethtx.address,
		gasOracle: gasOracle.address,
		weth: wethAddr,
		targetCRatioNum: 2,
		targetCRatioDen: 1,
	});

	await ethmxMinter.postInit(ethmxMinterArgs);

	await ethmxRewards.postInit({
		ethmx: ethmx.address,
		weth: wethAddr,
		accrualUpdateInterval: 43200, // 12 hours
	});

	await lpRewards.setRewardsToken(wethAddr);
	await lpRewards.addToken(sushiPairAddr, valuePerSushi.address);

	await ethtxRewardsMgr.ethtxRewardsManagerPostInit({
		defaultRecipient: defaultRewardsRecipient,
		rewardsToken: wethAddr,
		ethmxRewards: ethmxRewards.address,
		ethtx: ethtx.address,
		ethtxAMM: ethtxAmm.address,
		lpRewards: lpRewards.address,
		shares: [
			{
				account: defaultRewardsRecipient,
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

	console.log('Completed postInit script.');

	// Never execute twice
	return true;
};

const id = 'postInit' + version;

export default func;
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
];
