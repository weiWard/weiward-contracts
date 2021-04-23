import { expect } from 'chai';
import { BigNumber } from '@ethersproject/bignumber';
import { MaxUint256 } from '@ethersproject/constants';

import {
	Fixture,
	loadFixture,
	uniStake,
	parseTokenB,
	addRewards,
	parseRewardsToken,
	moonStake,
} from '../common';
import {
	ethToEthtx,
	ethUsedOnGas,
	parseGwei,
} from '../../../helpers/conversions';

export default function run(): void {
	let fixture: Fixture;
	const amountB = parseTokenB('10');
	const amountA = ethToEthtx(parseGwei('100'), amountB);
	const rewards = parseRewardsToken('100');
	let deployerRewards: BigNumber;
	let deployerUniRewards: BigNumber;
	let deployerMoonRewards: BigNumber;
	let testerRewards: BigNumber;

	beforeEach(async function () {
		fixture = await loadFixture();
		const {
			contract,
			deployer,
			tester,
			testerSigner,
			uniswapPool,
			mooniswapPool,
		} = fixture;

		await uniStake(fixture, amountA, amountB);
		await moonStake(fixture, amountA, amountB);
		await uniStake(fixture, amountA, amountB, testerSigner);

		const totalShares = await contract.totalShares();
		const deployerUniShares = await contract.sharesFor(
			deployer,
			uniswapPool.address,
		);
		const deployerMoonShares = await contract.sharesFor(
			deployer,
			mooniswapPool.address,
		);
		const testerShares = await contract.totalSharesFor(tester);

		deployerUniRewards = rewards.mul(deployerUniShares).div(totalShares);
		deployerMoonRewards = rewards
			.mul(deployerMoonShares)
			.div(totalShares)
			.sub(1);
		deployerRewards = deployerUniRewards.add(deployerMoonRewards);
		testerRewards = rewards.mul(testerShares).div(totalShares);

		await addRewards(fixture, rewards);
		await contract.updateAccrual();
	});

	it('initial state is correct', async function () {
		const {
			contract,
			deployer,
			tester,
			rewardsToken,
			uniswapPool,
			mooniswapPool,
		} = fixture;

		expect(rewards, 'rewards total mismatch').to.eq(
			deployerRewards.add(testerRewards).add(3),
		);

		expect(
			await rewardsToken.balanceOf(contract.address),
			'contract rewards balance mismatch before redemption',
		).to.eq(rewards);

		expect(
			await contract.rewardsForToken(uniswapPool.address),
			'uni rewardsForToken mismatch before redemption',
		).to.eq(deployerUniRewards.add(testerRewards).add(1));
		expect(
			await contract.rewardsForToken(mooniswapPool.address),
			'moon rewardsForToken mismatch before redemption',
		).to.eq(deployerMoonRewards.add(1));

		expect(
			await contract.lastRewardsBalanceOf(deployer),
			'deployer lastRewardsBalanceOf mismatch before redemption',
		).to.eq(0);
		expect(
			await contract.lastRewardsBalanceOfFor(deployer, uniswapPool.address),
			'deployer uni lastRewardsBalanceOfFor mismatch before redemption',
		).to.eq(0);
		expect(
			await contract.lastRewardsBalanceOfFor(deployer, mooniswapPool.address),
			'deployer moon lastRewardsBalanceOfFor mismatch before redemption',
		).to.eq(0);

		expect(
			await contract.rewardsBalanceOf(deployer),
			'deployer rewardsBalanceOf mismatch before redemption',
		).to.eq(deployerRewards);
		expect(
			await contract.rewardsBalanceOfFor(deployer, uniswapPool.address),
			'deployer uni rewardsBalanceOfFor mismatch before redemption',
		).to.eq(deployerUniRewards);
		expect(
			await contract.rewardsBalanceOfFor(deployer, mooniswapPool.address),
			'deployer moon rewardsBalanceOfFor mismatch before redemption',
		).to.eq(deployerMoonRewards);

		expect(
			await contract.lastRewardsBalanceOf(tester),
			'tester lastRewardsBalanceOf mismatch before redemption',
		).to.eq(0);
		expect(
			await contract.rewardsBalanceOf(tester),
			'tester rewardsBalanceOf mismatch before redemption',
		).to.eq(testerRewards);
	});

	it('should transfer all rewards for all tokens', async function () {
		const { contract, deployer, rewardsToken } = fixture;
		await contract.redeemAllRewards(true);

		expect(
			await rewardsToken.balanceOf(contract.address),
			'contract rewards balance mismatch after redemption',
		).to.eq(rewards.sub(deployerRewards));

		expect(
			await rewardsToken.balanceOf(deployer),
			'deployer rewards balance mismatch after redemption',
		).to.eq(deployerRewards);
	});

	it('should transfer all rewards for all tokens in ETH', async function () {
		const { contract, deployerSigner, rewardsToken } = fixture;

		const balanceBefore = await deployerSigner.getBalance();

		const tx = await contract.redeemAllRewards(false);

		const gasUsed = await ethUsedOnGas(tx);
		const balanceAfter = await deployerSigner.getBalance();

		expect(
			await rewardsToken.balanceOf(contract.address),
			'contract rewards balance mismatch after redemption',
		).to.eq(rewards.sub(deployerRewards));

		expect(
			balanceAfter.sub(balanceBefore),
			'deployer rewards balance mismatch after redemption',
		).to.eq(deployerRewards.sub(gasUsed));
	});

	it('should update accruedRewardsPerTokenLastFor all staked tokens', async function () {
		const { contract, deployer, uniswapPool, mooniswapPool } = fixture;

		const arptUni = await contract.accruedRewardsPerTokenFor(
			uniswapPool.address,
		);
		const arptMoon = await contract.accruedRewardsPerTokenFor(
			mooniswapPool.address,
		);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
			'accruedRewardsPerTokenLastFor uni mismatch before redemption',
		).to.eq(0);
		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				mooniswapPool.address,
			),
			'accruedRewardsPerTokenLastFor moon mismatch before redemption',
		).to.eq(0);

		await contract.redeemAllRewards(true);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
			'accruedRewardsPerTokenLastFor uni mismatch after redemption',
		).to.eq(arptUni);
		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				mooniswapPool.address,
			),
			'accruedRewardsPerTokenLastFor moon mismatch after redemption',
		).to.eq(arptMoon);
	});

	describe('should update totalRewardsRedeemed', async function () {
		it('correctly', async function () {
			const { contract } = fixture;
			await contract.redeemAllRewards(true);
			expect(await contract.totalRewardsRedeemed()).to.eq(deployerRewards);
		});

		it('with overflow', async function () {
			const { contract } = fixture;
			await contract.setTotalRewardsRedeemed(MaxUint256);
			await contract.redeemAllRewards(true);
			expect(await contract.totalRewardsRedeemed()).to.eq(
				deployerRewards.sub(1),
			);
		});
	});

	describe('should update totalRewardsRedeemedFor all tokens', async function () {
		it('correctly', async function () {
			const { contract, uniswapPool, mooniswapPool } = fixture;
			await contract.redeemAllRewards(true);
			expect(
				await contract.totalRewardsRedeemedFor(uniswapPool.address),
				'totalRewardsRedeemedFor uni mismatch',
			).to.eq(deployerUniRewards);
			expect(
				await contract.totalRewardsRedeemedFor(mooniswapPool.address),
				'totalRewardsRedeemedFor moon mismatch',
			).to.eq(deployerMoonRewards);
		});

		it('with overflow', async function () {
			const { contract, uniswapPool, mooniswapPool } = fixture;
			await contract.setRewardsRedeemedFor(uniswapPool.address, MaxUint256);
			await contract.setRewardsRedeemedFor(mooniswapPool.address, MaxUint256);
			await contract.redeemAllRewards(true);
			expect(
				await contract.totalRewardsRedeemedFor(uniswapPool.address),
				'totalRewardsRedeemedFor uni mismatch',
			).to.eq(deployerUniRewards.sub(1));
			expect(
				await contract.totalRewardsRedeemedFor(mooniswapPool.address),
				'totalRewardsRedeemedFor moon mismatch',
			).to.eq(deployerMoonRewards.sub(1));
		});
	});

	it('should update rewardsForToken for all tokens', async function () {
		const { contract, uniswapPool, mooniswapPool } = fixture;
		await contract.redeemAllRewards(true);
		expect(
			await contract.rewardsForToken(uniswapPool.address),
			'uni mismatch',
		).to.eq(testerRewards.add(1));
		expect(
			await contract.rewardsForToken(mooniswapPool.address),
			'moon mismatch',
		).to.eq(1);
	});

	it('should keep totalRewardsAccrued constant', async function () {
		const { contract } = fixture;

		expect(
			await contract.totalRewardsAccrued(),
			'mismatch before redemption',
		).to.eq(rewards);

		await contract.redeemAllRewards(true);

		expect(
			await contract.totalRewardsAccrued(),
			'mismatch after redemption',
		).to.eq(rewards);
	});

	it('should keep totalRewardsAccruedFor all tokens constant', async function () {
		const { contract, uniswapPool, mooniswapPool } = fixture;

		const uniExpected = deployerUniRewards.add(testerRewards).add(1);
		const moonExpected = deployerMoonRewards.add(1);

		expect(
			await contract.totalRewardsAccruedFor(uniswapPool.address),
			'uni mismatch before redemption',
		).to.eq(uniExpected);
		expect(
			await contract.totalRewardsAccruedFor(mooniswapPool.address),
			'moon mismatch before redemption',
		).to.eq(moonExpected);

		await contract.redeemAllRewards(true);

		expect(
			await contract.totalRewardsAccruedFor(uniswapPool.address),
			'uni mismatch after redemption',
		).to.eq(uniExpected);
		expect(
			await contract.totalRewardsAccruedFor(mooniswapPool.address),
			'moon mismatch after redemption',
		).to.eq(moonExpected);
	});

	it('should zero rewardsBalanceOfFor all tokens', async function () {
		const { contract, deployer, uniswapPool, mooniswapPool } = fixture;

		await contract.redeemAllRewards(true);

		expect(
			await contract.rewardsBalanceOfFor(deployer, uniswapPool.address),
			'uni mismatch',
		).to.eq(0);
		expect(
			await contract.rewardsBalanceOfFor(deployer, mooniswapPool.address),
			'moon mismatch',
		).to.eq(0);
	});

	it('should zero rewardsBalanceOf', async function () {
		const { contract, deployer } = fixture;

		await contract.redeemAllRewards(true);

		expect(await contract.rewardsBalanceOf(deployer)).to.eq(0);
	});

	it('should not affect rewardsBalanceOf for others', async function () {
		const { contract, tester } = fixture;

		await contract.redeemAllRewards(true);

		expect(await contract.rewardsBalanceOf(tester)).to.eq(testerRewards);
	});

	it('should not affect rewardsBalanceOfFor for others', async function () {
		const { contract, tester, uniswapPool } = fixture;

		await contract.redeemAllRewards(true);

		expect(
			await contract.rewardsBalanceOfFor(tester, uniswapPool.address),
		).to.eq(testerRewards);
	});

	it('should emit RewardPaid event for first token', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await expect(contract.redeemAllRewards(true))
			.to.emit(contract, 'RewardPaid')
			.withArgs(deployer, uniswapPool.address, deployerUniRewards);
	});

	it('should emit RewardPaid event for second token', async function () {
		const { contract, deployer, mooniswapPool } = fixture;

		await expect(contract.redeemAllRewards(true))
			.to.emit(contract, 'RewardPaid')
			.withArgs(deployer, mooniswapPool.address, deployerMoonRewards);
	});
}
