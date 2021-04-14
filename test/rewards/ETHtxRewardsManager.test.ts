import { expect } from 'chai';
import { deployments } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';
import { MaxUint256 } from '@ethersproject/constants';
import { parseEther } from '@ethersproject/units';

import {
	ETHtxAMM,
	ETHtxAMM__factory,
	ETHmx__factory,
	ETHmxMinter__factory,
	FeeLogic__factory,
	MockETHmxRewards,
	MockETHmxRewards__factory,
	MockETHtx,
	MockETHtx__factory,
	MockETHtxRewardsManager,
	MockETHtxRewardsManager__factory,
	MockGasPrice__factory,
	MockLPRewards,
	MockLPRewards__factory,
	ValuePerUNIV2__factory,
	WETH9,
	WETH9__factory,
} from '../../build/types/ethers-v5';
import { zeroAddress, zeroPadAddress } from '../helpers/address';
import {
	parseGwei,
	parseETHtx,
	ethToEthtx,
	sendWETH,
} from '../helpers/conversions';
import { uniswapPairFixture } from '../helpers/fixtures';

const contractName = 'ETHtxRewardsManager';

const defaultRecipient = zeroPadAddress('0x1');
const defaultGasPrice = parseGwei('200');
const mintGasPrice = parseGwei('1000');
const ethmxAccrualUpdateInterval = 3600; // 1 hour
const feeNumerator = 75;
const feeDenominator = 1000;
const roiNumerator = 5;
const roiDenominator = 1;
const targetCRatioNumerator = 2;
const targetCRatioDenominator = 1;
const oracleUpdateInterval = 3600;
const defaultShares = 10;
const ethmxRewardsShares = 45 + defaultShares;
const lpRewardsShares = 20;
const totalShares = ethmxRewardsShares + lpRewardsShares + defaultShares;

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: MockETHtxRewardsManager;
	testerContract: MockETHtxRewardsManager;
	ethtx: MockETHtx;
	ethtxAMM: ETHtxAMM;
	ethmxRewards: MockETHmxRewards;
	lpRewards: MockLPRewards;
	weth: WETH9;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ getNamedAccounts, waffle }) => {
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const weth = await new WETH9__factory(deployerSigner).deploy();

		const feeLogic = await new FeeLogic__factory(deployerSigner).deploy(
			deployer,
			defaultRecipient,
			feeNumerator,
			feeDenominator,
		);

		const oracle = await new MockGasPrice__factory(deployerSigner).deploy(
			deployer,
			oracleUpdateInterval,
			defaultGasPrice,
		);

		const ethtx = await new MockETHtx__factory(deployerSigner).deploy(
			deployer,
		);

		const ethtxAMM = await new ETHtxAMM__factory(deployerSigner).deploy(
			deployer,
		);
		await ethtxAMM.postInit({
			ethtx: ethtx.address,
			gasOracle: oracle.address,
			weth: weth.address,
			targetCRatioNum: targetCRatioNumerator,
			targetCRatioDen: targetCRatioDenominator,
		});
		await feeLogic.setExempt(ethtxAMM.address, true);

		const ethmx = await new ETHmx__factory(deployerSigner).deploy(deployer);

		const ethmxMinter = await new ETHmxMinter__factory(deployerSigner).deploy(
			deployer,
		);
		await ethmxMinter.postInit({
			ethmx: ethmx.address,
			ethtx: ethtx.address,
			ethtxAMM: ethtxAMM.address,
			weth: weth.address,
			mintGasPrice,
			roiNumerator,
			roiDenominator,
			earlyThreshold: 0,
			lpShareNumerator: 25,
			lpShareDenominator: 100,
			lps: [],
			lpRecipient: zeroAddress,
		});
		await ethmx.setMinter(ethmxMinter.address);
		await ethtx.postInit({
			feeLogic: feeLogic.address,
			minter: ethmxMinter.address,
		});

		const ethmxRewards = await new MockETHmxRewards__factory(
			deployerSigner,
		).deploy(deployer);
		await ethmxRewards.postInit({
			ethmx: ethmx.address,
			weth: weth.address,
			accrualUpdateInterval: ethmxAccrualUpdateInterval,
		});

		const { pair: uniPool } = await uniswapPairFixture(deployer, ethtx, weth);
		const valuePerUNIV2 = await new ValuePerUNIV2__factory(
			deployerSigner,
		).deploy(uniPool.address, weth.address);

		const lpRewards = await new MockLPRewards__factory(deployerSigner).deploy(
			deployer,
			weth.address,
		);
		await lpRewards.addToken(uniPool.address, valuePerUNIV2.address);

		const contract = await new MockETHtxRewardsManager__factory(
			deployerSigner,
		).deploy(deployer);
		await contract.ethtxRewardsManagerPostInit({
			defaultRecipient,
			rewardsToken: weth.address,
			ethmxRewards: ethmxRewards.address,
			ethtx: ethtx.address,
			ethtxAMM: ethtxAMM.address,
			lpRewards: lpRewards.address,
		});
		const testerContract = contract.connect(testerSigner);

		await feeLogic.setRecipient(contract.address);
		await feeLogic.setExempt(contract.address, true);

		const sharesAccounts = [
			defaultRecipient,
			ethmxRewards.address,
			lpRewards.address,
		];
		const sharesValues = [defaultShares, ethmxRewardsShares, lpRewardsShares];
		const sharesActive = [true, true, true];

		await contract.setSharesBatch(sharesAccounts, sharesValues, sharesActive);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			testerContract,
			ethtx,
			ethtxAMM,
			ethmxRewards,
			lpRewards,
			weth,
		};
	},
);

describe(contractName, function () {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('constructor', function () {
		it('initial state is correct', async function () {
			const {
				contract,
				deployer,
				ethmxRewards,
				ethtx,
				ethtxAMM,
				lpRewards,
				weth,
			} = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);

			expect(
				await contract.defaultRecipient(),
				'default recipient mismatch',
			).to.eq(defaultRecipient);

			expect(
				await contract.rewardsToken(),
				'rewardsToken address mismatch',
			).to.eq(weth.address);

			expect(await contract.ethmxRewards(), 'ethmxRewards mismatch').to.eq(
				ethmxRewards.address,
			);
			let [active] = await contract.sharesFor(ethmxRewards.address);
			expect(active, 'ethmxRewards shares mismatch').to.eq(ethmxRewardsShares);

			expect(await contract.ethtx(), 'ethtx mismatch').to.eq(ethtx.address);

			expect(await contract.ethtxAMM(), 'ethtxAMM mismatch').to.eq(
				ethtxAMM.address,
			);

			expect(await contract.lpRewards(), 'lpRewardsAddr mismatch').to.eq(
				lpRewards.address,
			);
			[active] = await contract.sharesFor(lpRewards.address);
			expect(active, 'lpRewards shares mismatch').to.eq(lpRewardsShares);

			[active] = await contract.sharesFor(defaultRecipient);
			expect(active, 'defaultRecipient shares mismatch').to.eq(defaultShares);
		});
	});

	describe('convertETHtx', function () {
		it('should do nothing without ETHtx', async function () {
			const { contract, ethtx } = fixture;

			await expect(contract.convertETHtx()).to.not.emit(ethtx, 'Transfer');
		});

		it('should redeem ETHtx for WETH', async function () {
			const { contract, ethtx, ethtxAMM, weth } = fixture;
			const amount = parseEther('10');

			await sendWETH(weth, ethtxAMM.address, amount.mul(10));
			await ethtx.mockMint(
				contract.address,
				ethToEthtx(defaultGasPrice, amount),
			);
			await contract.convertETHtx();

			expect(
				await ethtx.balanceOf(contract.address),
				'ETHtx balance mismatch',
			).to.eq(0);
			expect(
				await weth.balanceOf(contract.address),
				'WETH balance mismatch',
			).to.eq(amount.sub(1));
		});
	});

	describe('distributeRewards', function () {
		it('should convertETHtx', async function () {
			const { contract, ethtx, ethtxAMM } = fixture;
			const amount = parseETHtx('100');

			await ethtx.mockMint(contract.address, amount);

			await expect(contract.distributeRewards())
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, ethtxAMM.address, amount);
		});

		it('should sendRewards', async function () {
			const { contract, ethtx, ethtxAMM, weth } = fixture;
			const amount = parseEther('10');
			const amountToDefault = amount.mul(defaultShares).div(totalShares);

			await sendWETH(weth, ethtxAMM.address, amount.mul(10));
			await ethtx.mockMint(
				contract.address,
				ethToEthtx(defaultGasPrice, amount),
			);

			await expect(contract.distributeRewards())
				.to.emit(weth, 'Transfer')
				.withArgs(contract.address, defaultRecipient, amountToDefault);
		});

		it('should notifyRecipients', async function () {
			const { contract, ethtx, ethtxAMM, lpRewards, weth } = fixture;
			const amount = parseEther('10');
			const amountToLpRewards = amount.mul(lpRewardsShares).div(totalShares);

			await sendWETH(weth, ethtxAMM.address, amount.mul(10));
			await ethtx.mockMint(
				contract.address,
				ethToEthtx(defaultGasPrice, amount),
			);

			await expect(contract.distributeRewards())
				.to.emit(lpRewards, 'AccrualUpdated')
				.withArgs(contract.address, amountToLpRewards);
		});
	});

	describe('notifyRecipients', function () {
		it('should call updateAccrual on ETHmxRewards', async function () {
			const { contract, ethmxRewards, weth } = fixture;
			const amount = parseEther('10');

			await sendWETH(weth, ethmxRewards.address, amount);

			await expect(contract.notifyRecipients())
				.to.emit(ethmxRewards, 'AccrualUpdated')
				.withArgs(contract.address, amount);
		});

		it('should not call updateAccrual on ETHmxRewards if not ready', async function () {
			const { contract, ethmxRewards, weth } = fixture;
			const amount = parseEther('10');

			await sendWETH(weth, ethmxRewards.address, amount);
			await contract.notifyRecipients();
			await sendWETH(weth, ethmxRewards.address, amount);

			await expect(contract.notifyRecipients()).to.not.emit(
				ethmxRewards,
				'AccrualUpdated',
			);
		});

		it('should call updateAccrual on LPRewards', async function () {
			const { contract, lpRewards, weth } = fixture;
			const amount = parseEther('10');

			await sendWETH(weth, lpRewards.address, amount);

			await expect(contract.notifyRecipients())
				.to.emit(lpRewards, 'AccrualUpdated')
				.withArgs(contract.address, amount);
		});
	});

	describe('sendRewards', function () {
		it('should do nothing with no rewards', async function () {
			const { contract, weth } = fixture;

			await expect(contract.sendRewards()).to.not.emit(weth, 'Transfer');
		});

		describe('should transfer correct amount', async function () {
			const amount = parseEther('10');

			beforeEach(async function () {
				const { contract, weth } = fixture;

				await sendWETH(weth, contract.address, amount);
			});

			it('to ETHmxRewards', async function () {
				const { contract, ethmxRewards, weth } = fixture;
				const amountToTarget = amount.mul(ethmxRewardsShares).div(totalShares);

				await expect(contract.sendRewards())
					.to.emit(weth, 'Transfer')
					.withArgs(contract.address, ethmxRewards.address, amountToTarget);
			});

			it('to LPRewards', async function () {
				const { contract, lpRewards, weth } = fixture;
				const amountToTarget = amount.mul(lpRewardsShares).div(totalShares);

				await expect(contract.sendRewards())
					.to.emit(weth, 'Transfer')
					.withArgs(contract.address, lpRewards.address, amountToTarget);
			});

			it('to defaultRecipient', async function () {
				const { contract, weth } = fixture;
				const amountToTarget = amount.mul(defaultShares).div(totalShares);

				await expect(contract.sendRewards())
					.to.emit(weth, 'Transfer')
					.withArgs(contract.address, defaultRecipient, amountToTarget);
			});

			it('to new recipient', async function () {
				const { contract, tester, weth } = fixture;
				const newShares = 15;
				const amountToTarget = amount
					.mul(newShares)
					.div(totalShares + newShares);

				await contract.setShares(tester, newShares, true);

				await expect(contract.sendRewards())
					.to.emit(weth, 'Transfer')
					.withArgs(contract.address, tester, amountToTarget);
			});
		});

		describe('should update totalRewardsRedeemed', function () {
			const amount = parseEther('10');

			beforeEach(async function () {
				const { contract, weth } = fixture;

				await sendWETH(weth, contract.address, amount);
			});

			it('correctly', async function () {
				const { contract } = fixture;
				await contract.sendRewards();
				expect(await contract.totalRewardsRedeemed()).to.eq(amount);
			});

			it('with overflow', async function () {
				const { contract } = fixture;

				await contract.setTotalRewardsRedeemed(MaxUint256);

				await contract.sendRewards();

				expect(await contract.totalRewardsRedeemed()).to.eq(amount.sub(1));
			});
		});
	});

	describe('setEthmxRewards', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(
				testerContract.setEthmxRewards(zeroAddress),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should set ethmxRewardsAddr', async function () {
			const { contract } = fixture;
			await contract.setEthmxRewards(zeroAddress);
			expect(await contract.ethmxRewards()).to.eq(zeroAddress);
		});

		it('should emit EthmxRewardsSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setEthmxRewards(zeroAddress))
				.to.emit(contract, 'EthmxRewardsSet')
				.withArgs(deployer, zeroAddress);
		});
	});

	describe('setEthtx', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setEthtx(zeroAddress)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should set ethtxAddr', async function () {
			const { contract } = fixture;
			await contract.setEthtx(zeroAddress);
			expect(await contract.ethtx()).to.eq(zeroAddress);
		});

		it('should emit EthtxSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setEthtx(zeroAddress))
				.to.emit(contract, 'EthtxSet')
				.withArgs(deployer, zeroAddress);
		});
	});

	describe('setEthtxAMM', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setEthtxAMM(zeroAddress)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should set ethtxAddr', async function () {
			const { contract } = fixture;
			await contract.setEthtxAMM(zeroAddress);
			expect(await contract.ethtxAMM()).to.eq(zeroAddress);
		});

		it('should emit EthtxSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setEthtxAMM(zeroAddress))
				.to.emit(contract, 'EthtxAMMSet')
				.withArgs(deployer, zeroAddress);
		});
	});

	describe('setLPRewards', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(
				testerContract.setLPRewards(zeroAddress),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should set lpRewardsAddr', async function () {
			const { contract } = fixture;
			await contract.setLPRewards(zeroAddress);
			expect(await contract.lpRewards()).to.eq(zeroAddress);
		});

		it('should emit LPRewardsSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setLPRewards(zeroAddress))
				.to.emit(contract, 'LPRewardsSet')
				.withArgs(deployer, zeroAddress);
		});
	});
});
