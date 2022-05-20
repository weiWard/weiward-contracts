import { expect } from 'chai';
import { BigNumber } from '@ethersproject/bignumber';

import {
	Fixture,
	loadFixture,
	addRewards,
	parseRewardsToken,
	parseTokenB,
	uniStake,
	moonStake,
	roundingMultiplier,
} from '../common';
import { ethToEthtx, parseGwei } from '../../../helpers/conversions';

export default function run(): void {
	let fixture: Fixture;
	const rewards = parseRewardsToken('10');

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should update lastTotalRewardsAccrued', async function () {
		const { contract } = fixture;

		await addRewards(fixture, rewards);

		await contract.updateAccrual();

		expect(await contract.lastTotalRewardsAccrued()).to.eq(rewards);
	});

	it('should update unredeemableRewards with no stake', async function () {
		const { contract } = fixture;

		await addRewards(fixture, rewards);

		await contract.updateAccrual();

		expect(await contract.unredeemableRewards()).to.eq(rewards);
	});

	describe('with stake', async function () {
		let uniStaked: BigNumber;
		let moonStaked: BigNumber;
		let uniRewards: BigNumber;
		let moonRewards: BigNumber;

		beforeEach(async function () {
			const { contract, uniswapPool, mooniswapPool } = fixture;

			const amountB = parseTokenB('10');
			const amountA = ethToEthtx(parseGwei('100'), amountB);
			uniStaked = await uniStake(fixture, amountA, amountB);
			moonStaked = await moonStake(fixture, amountA, amountB);

			const uniShare = await contract.totalSharesForToken(uniswapPool.address);
			const moonShare = await contract.totalSharesForToken(
				mooniswapPool.address,
			);
			const totalShare = uniShare.add(moonShare);

			uniRewards = rewards.mul(uniShare).div(totalShare);
			moonRewards = rewards.mul(moonShare).div(totalShare);

			await addRewards(fixture, rewards);

			await contract.updateAccrual();
		});

		it('should update rewardsForToken all staked tokens', async function () {
			const { contract, uniswapPool, mooniswapPool } = fixture;

			expect(
				await contract.rewardsForToken(uniswapPool.address),
				'uni mismatch',
			).to.eq(uniRewards);
			expect(
				await contract.rewardsForToken(mooniswapPool.address),
				'moon mismatch',
			).to.eq(moonRewards);
		});

		it('should update accruedRewardsPerTokenFor all staked tokens', async function () {
			const { contract, uniswapPool, mooniswapPool } = fixture;

			const uniArpt = uniRewards.mul(roundingMultiplier).div(uniStaked);
			const moonArpt = moonRewards.mul(roundingMultiplier).div(moonStaked);

			expect(
				await contract.accruedRewardsPerTokenFor(uniswapPool.address),
				'uni mismatch',
			).to.eq(uniArpt);
			expect(
				await contract.accruedRewardsPerTokenFor(mooniswapPool.address),
				'moon mismatch',
			).to.eq(moonArpt);
		});

		it('should update lastTotalRewardsAccruedFor all staked tokens', async function () {
			const { contract, uniswapPool, mooniswapPool } = fixture;

			expect(
				await contract.lastTotalRewardsAccruedFor(uniswapPool.address),
				'uni mismatch',
			).to.eq(uniRewards);
			expect(
				await contract.lastTotalRewardsAccruedFor(mooniswapPool.address),
				'moon mismatch',
			).to.eq(moonRewards);
		});

		it('should do nothing without new rewards', async function () {
			const { contract } = fixture;
			await expect(contract.updateAccrual()).to.not.emit(
				contract,
				'AccrualUpdated',
			);
		});

		it('should emit AccrualUpdated event', async function () {
			const { contract, deployer } = fixture;

			await addRewards(fixture, rewards);

			await expect(contract.updateAccrual())
				.to.emit(contract, 'AccrualUpdated')
				.withArgs(deployer, rewards);
		});
	});
}
