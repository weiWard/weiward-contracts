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
	GasPrice__factory,
} from '../../build/types/ethers-v5';
import { solidityKeccak256 } from 'ethers/lib/utils';

const version = 'v1.1.0';

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
		gasOracleService,
	} = await getNamedAccounts();

	const deployerSigner = ethers.provider.getSigner(deployer);
	const chainId = await getChainId();

	const wethAddr = await getDeployedWETH(deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const gasOracle = GasPrice__factory.connect(
		(await deployments.get('GasPrice')).address,
		deployerSigner,
	);
	const policy = await deployments.get('Policy');
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

	const gasOracleRole = solidityKeccak256(['string'], ['ORACLE_ROLE']);
	const ethtxRebasers = [policy.address, gasOracleService];

	if (migrations['postInitv1.0.0']) {
		console.log('Migrating from v1.0.0...');
		await ethtx.postUpgrade(feeLogic.address, ethtxRebasers);
		await gasOracle.grantRole(gasOracleRole, policy.address);
		console.log('Completed migration to v1.1.0.');
		return true;
	} else if (migrations['postInitv0.3.0']) {
		console.log('Migrating from v0.3.0...');
		await ethtx.postUpgrade(feeLogic.address, ethtxRebasers);
		await ethmxMinter.postInit(ethmxMinterArgs);
		console.log('Completed migration to v1.1.0.');
		return true;
	}

	await gasOracle.grantRole(gasOracleRole, policy.address);

	await ethtx.postInit({
		feeLogic: feeLogic.address,
		minters: [ethmxMinter.address],
		rebasers: ethtxRebasers,
	});

	await ethmx.setMinter(ethmxMinter.address);

	await (ethtxAmm as Contract).postInit({
		ethtx: ethtx.address,
		gasOracle: gasOracle.address,
		weth: wethAddr,
		targetCRatioNum: 2,
		targetCRatioDen: 1,
	});

	await (ethmxMinter as Contract).postInit(ethmxMinterArgs);

	await (ethmxRewards as Contract).postInit({
		ethmx: ethmx.address,
		weth: wethAddr,
		accrualUpdateInterval: 43200, // 12 hours
	});

	await (lpRewards as Contract).setRewardsToken(wethAddr);
	await (lpRewards as Contract).addToken(sushiPairAddr, valuePerSushi.address);

	await (ethtxRewardsMgr as Contract).ethtxRewardsManagerPostInit({
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
	'ETHtxv1.1.0',
	'ETHmxv0.3.0',
	'ETHtxAMMv1.0.0',
	'ETHmxMinterv1.0.0',
	'ETHmxRewardsv1.0.0',
	'LPRewardsv1.0.0',
	'ETHtxRewardsManagerv0.3.0',
	'SushiV2Factoryv0.3.0',
	'SushiV2Router02v0.3.0',
	'SushiV2Pairv0.3.0',
	'FeeLogicv1.1.0',
	'ValuePerSushiv0.3.0',
	'Policyv1.1.0',
];
