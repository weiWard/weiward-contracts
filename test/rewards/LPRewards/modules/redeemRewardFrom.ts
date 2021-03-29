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
import { ethToEthtx, parseGwei } from '../../../helpers/conversions';

export default function run(): void {
	let fixture: Fixture;
	const amountB = parseTokenB('10');
	const amountA = ethToEthtx(parseGwei('100'), amountB);
	const rewards = parseRewardsToken('100');
	let deployerRewards: BigNumber;
	let deployerUniRewards: BigNumber;
	let deployerMoonRewards: BigNumber;
	let testerRewards: BigNumber;
	let redeemed: BigNumber;

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
		redeemed = deployerUniRewards.div(2);
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

	it('should revert if amount is zero', async function () {
		const { contract, uniswapPool } = fixture;
		await expect(
			contract.redeemRewardFrom(uniswapPool.address, 0),
		).to.be.revertedWith('cannot redeem zero');
	});

	it('should revert when amount > rewards', async function () {
		const { contract, uniswapPool } = fixture;
		await expect(
			contract.redeemRewardFrom(
				uniswapPool.address,
				deployerUniRewards.add(1),
			),
		).to.be.revertedWith('cannot redeem more rewards than earned');
	});

	it('should transfer correct rewards for a token', async function () {
		const { contract, deployer, rewardsToken, uniswapPool } = fixture;
		await contract.redeemRewardFrom(uniswapPool.address, redeemed);

		expect(
			await rewardsToken.balanceOf(contract.address),
			'contract rewards balance mismatch after redemption',
		).to.eq(rewards.sub(redeemed));

		expect(
			await rewardsToken.balanceOf(deployer),
			'deployer rewards balance mismatch after redemption',
		).to.eq(redeemed);
	});

	it('should update accruedRewardsPerTokenLastFor', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		const arpt = await contract.accruedRewardsPerTokenFor(uniswapPool.address);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
			'accruedRewardsPerTokenLastFor mismatch before redemption',
		).to.eq(0);

		await contract.redeemRewardFrom(uniswapPool.address, redeemed);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
			'accruedRewardsPerTokenLastFor mismatch after redemption',
		).to.eq(arpt);
	});

	describe('should update totalRewardsRedeemed', async function () {
		it('correctly', async function () {
			const { contract, uniswapPool } = fixture;
			await contract.redeemRewardFrom(uniswapPool.address, redeemed);
			expect(await contract.totalRewardsRedeemed()).to.eq(redeemed);
		});

		it('with overflow', async function () {
			const { contract, uniswapPool } = fixture;
			await contract.setTotalRewardsRedeemed(MaxUint256);
			await contract.redeemRewardFrom(uniswapPool.address, redeemed);
			expect(await contract.totalRewardsRedeemed()).to.eq(redeemed.sub(1));
		});
	});

	describe('should update totalRewardsRedeemedFor', async function () {
		it('correctly', async function () {
			const { contract, uniswapPool } = fixture;
			await contract.redeemRewardFrom(uniswapPool.address, redeemed);
			expect(
				await contract.totalRewardsRedeemedFor(uniswapPool.address),
			).to.eq(redeemed);
		});

		it('with overflow', async function () {
			const { contract, uniswapPool } = fixture;
			await contract.setRewardsRedeemedFor(uniswapPool.address, MaxUint256);
			await contract.redeemRewardFrom(uniswapPool.address, redeemed);
			expect(
				await contract.totalRewardsRedeemedFor(uniswapPool.address),
			).to.eq(redeemed.sub(1));
		});
	});

	it('should update rewardsForToken', async function () {
		const { contract, uniswapPool } = fixture;
		await contract.redeemRewardFrom(uniswapPool.address, redeemed);
		expect(await contract.rewardsForToken(uniswapPool.address)).to.eq(
			deployerUniRewards.add(testerRewards).sub(redeemed).add(1),
		);
	});

	it('should not affect rewardsForToken for other tokens', async function () {
		const { contract, uniswapPool, mooniswapPool } = fixture;
		await contract.redeemRewardFrom(uniswapPool.address, redeemed);
		expect(await contract.rewardsForToken(mooniswapPool.address)).to.eq(
			deployerMoonRewards.add(1),
		);
	});

	it('should keep totalRewardsAccrued constant', async function () {
		const { contract, uniswapPool } = fixture;

		expect(
			await contract.totalRewardsAccrued(),
			'mismatch before redemption',
		).to.eq(rewards);

		await contract.redeemRewardFrom(uniswapPool.address, redeemed);

		expect(
			await contract.totalRewardsAccrued(),
			'mismatch after redemption',
		).to.eq(rewards);
	});

	it('should keep totalRewardsAccruedFor constant', async function () {
		const { contract, uniswapPool } = fixture;

		const expected = deployerUniRewards.add(testerRewards).add(1);

		expect(
			await contract.totalRewardsAccruedFor(uniswapPool.address),
			'mismatch before redemption',
		).to.eq(expected);

		await contract.redeemRewardFrom(uniswapPool.address, redeemed);

		expect(
			await contract.totalRewardsAccruedFor(uniswapPool.address),
			'mismatch after redemption',
		).to.eq(expected);
	});

	it('should update rewardsBalanceOfFor token', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await contract.redeemRewardFrom(uniswapPool.address, redeemed);

		expect(
			await contract.rewardsBalanceOfFor(deployer, uniswapPool.address),
		).to.eq(deployerUniRewards.sub(redeemed));
	});

	it('should update rewardsBalanceOf', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await contract.redeemRewardFrom(uniswapPool.address, redeemed);

		expect(await contract.rewardsBalanceOf(deployer)).to.eq(
			deployerRewards.sub(redeemed),
		);
	});

	it('should not affect rewardsBalanceOf for others', async function () {
		const { contract, tester, uniswapPool } = fixture;

		await contract.redeemRewardFrom(uniswapPool.address, redeemed);

		expect(await contract.rewardsBalanceOf(tester)).to.eq(testerRewards);
	});

	it('should not affect rewardsBalanceOfFor token for others', async function () {
		const { contract, tester, uniswapPool } = fixture;

		await contract.redeemRewardFrom(uniswapPool.address, redeemed);

		expect(
			await contract.rewardsBalanceOfFor(tester, uniswapPool.address),
		).to.eq(testerRewards);
	});

	it('should not affect rewardsBalanceOfFor other tokens', async function () {
		const { contract, deployer, uniswapPool, mooniswapPool } = fixture;

		await contract.redeemRewardFrom(uniswapPool.address, redeemed);

		expect(
			await contract.rewardsBalanceOfFor(deployer, mooniswapPool.address),
		).to.eq(deployerMoonRewards);
	});

	it('should emit RewardPaid event', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await expect(contract.redeemRewardFrom(uniswapPool.address, redeemed))
			.to.emit(contract, 'RewardPaid')
			.withArgs(deployer, uniswapPool.address, redeemed);
	});
}
