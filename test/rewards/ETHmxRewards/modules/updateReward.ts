import { expect } from 'chai';
import { parseEther, formatEther } from 'ethers/lib/utils';
import { MaxUint256, Zero } from '@ethersproject/constants';
import { BigNumberish } from '@ethersproject/bignumber';

import {
	Fixture,
	loadFixture,
	addRewards,
	stake,
	roundingFactor,
} from '../common';

// TODO stagger staking and ensure rewards aren't accumulated too quickly

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should update accruedRewardsPerTokenLast', async function () {
		const { contract, deployer } = fixture;
		const staked = parseEther('10');
		const rewards = parseEther('7');

		await stake(fixture, staked);
		await addRewards(fixture, rewards);

		await contract.updateAccrual();
		await contract.updateReward();

		expect(await contract.accruedRewardsPerTokenLast(deployer)).to.eq(
			rewards.mul(roundingFactor).div(staked),
		);
	});

	it('should handle accruedRewardsPerToken overflow', async function () {
		const { contract, deployer } = fixture;
		const staked = parseEther('10');
		const rewards = parseEther('7');

		await contract.setAccruedRewardsPerToken(MaxUint256);

		await stake(fixture, staked);
		await addRewards(fixture, rewards);

		expect(
			await contract.accruedRewardsPerTokenLast(deployer),
			'accruedRewardsPerTokenLast mismatch before update',
		).to.eq(MaxUint256);

		await contract.updateAccrual();
		await contract.updateReward();

		expect(
			await contract.rewardsBalanceOf(deployer),
			'rewardBalanceOf mismatch',
		).to.eq(rewards);

		expect(
			await contract.accruedRewardsPerTokenLast(deployer),
			'accruedRewardsPerTokenLast mismatch after update',
		).to.eq(rewards.mul(roundingFactor).div(staked).sub(1));
	});

	describe('when new rewards < stake', function () {
		const staked = parseEther('10');
		const rewards = parseEther('7');

		beforeEach(async function () {
			const { contract } = fixture;

			await stake(fixture, staked);
			await addRewards(fixture, rewards);
			await contract.updateAccrual();
			await contract.updateReward();
		});

		it('should update stakedBalanceOf', async function () {
			const { contract, deployer } = fixture;
			const expected = staked.sub(rewards);
			expect(await contract.stakedBalanceOf(deployer)).to.eq(expected);
		});

		it('should update rewardsBalanceOf', async function () {
			const { contract, deployer } = fixture;
			expect(await contract.rewardsBalanceOf(deployer)).to.eq(rewards);
		});
	});

	describe('when new rewards > stake', function () {
		const staked = parseEther('10');
		const rewards = parseEther('25');

		beforeEach(async function () {
			const { contract } = fixture;

			await stake(fixture, staked);
			await addRewards(fixture, rewards);
			await contract.updateAccrual();
			await contract.updateReward();
		});

		it('should update stakedBalanceOf', async function () {
			const { contract, deployer } = fixture;
			expect(await contract.stakedBalanceOf(deployer)).to.eq(0);
		});

		it('should update rewardsBalanceOf', async function () {
			const { contract, deployer } = fixture;
			expect(await contract.rewardsBalanceOf(deployer)).to.eq(staked);
		});
	});

	describe('should be correct when multiple parties stake', async function () {
		describe('when new rewards < stake', function () {
			const staked = parseEther('50');
			const rewards = parseEther('7');

			interface BalanceData {
				fixture: Fixture;
				checkpoint: number;
				totalStake: BigNumberish;
				stakeA: BigNumberish;
				stakeB: BigNumberish;
				totalRewards: BigNumberish;
				rewardsA: BigNumberish;
				rewardsB: BigNumberish;
			}

			async function checkBalances({
				fixture,
				checkpoint,
				totalStake,
				stakeA,
				stakeB,
				totalRewards,
				rewardsA,
				rewardsB,
			}: BalanceData): Promise<void> {
				const { contract, deployer, tester } = fixture;

				expect(
					await contract.totalStaked(),
					`checkpoint ${checkpoint}: totalStake mismatch`,
				).to.eq(totalStake);

				expect(
					await contract.totalRewardsAccrued(),
					`checkpoint ${checkpoint}: totalRewardsAccrued mismatch`,
				).to.eq(totalRewards);

				expect(
					await contract.rewardsBalanceOf(deployer),
					`checkpoint ${checkpoint}: deployer rewardsBalanceOf mismatch`,
				).to.be.lte(rewardsA);

				expect(
					await contract.rewardsBalanceOf(tester),
					`checkpoint ${checkpoint}: tester rewardsBalanceOf mismatch`,
				).to.be.lte(rewardsB);

				expect(
					await contract.stakedBalanceOf(deployer),
					`checkpoint ${checkpoint}: deployer stakedBalanceOf mismatch`,
				).to.be.gte(stakeA);

				expect(
					await contract.stakedBalanceOf(tester),
					`checkpoint ${checkpoint}: tester stakedBalanceOf mismatch`,
				).to.be.gte(stakeB);
			}

			it.only('with staggered entry', async function () {
				const { contract, testerContract, testerSigner } = fixture;

				const data: BalanceData = {
					fixture,
					checkpoint: 1,
					totalStake: Zero,
					stakeA: Zero,
					stakeB: Zero,
					totalRewards: Zero,
					rewardsA: Zero,
					rewardsB: Zero,
				};

				await stake(fixture, staked);
				data.stakeA = staked;
				await addRewards(fixture, rewards);
				data.totalRewards = rewards;
				await contract.updateAccrual();
				data.totalStake = staked.sub(rewards);

				data.checkpoint = 1;
				await checkBalances(data);

				await stake(fixture, staked, testerSigner);
				data.stakeB = staked;
				data.totalStake = data.totalStake.add(staked);

				await addRewards(fixture, rewards);
				data.totalRewards = data.totalRewards.add(rewards);

				await contract.updateAccrual();
				data.totalStake = data.totalStake.sub(rewards);
				await contract.updateReward();
				let newRewardsA = rewards.mul(data.stakeA).div(data.totalStake);
				data.rewardsA = rewards.add(newRewardsA);
				data.stakeA = data.stakeA.sub(data.rewardsA);

				data.checkpoint = 2;
				await checkBalances(data);

				await addRewards(fixture, rewards);
				data.totalRewards = data.totalRewards.add(rewards);

				await contract.updateAccrual();
				data.totalStake = data.totalStake.sub(rewards);
				await testerContract.updateReward();
				data.rewardsB = rewards.mul(2).mul(data.stakeB).div(data.totalStake);
				data.stakeB = data.stakeB.sub(data.rewardsB);

				data.checkpoint = 3;
				await checkBalances(data);

				await contract.updateReward();
				newRewardsA = rewards.mul(data.stakeA).div(data.totalStake);
				data.rewardsA = data.rewardsA.add(newRewardsA);
				data.stakeA = data.stakeA.sub(newRewardsA);

				data.checkpoint = 4;
				await checkBalances(data);

				const { deployer, tester } = fixture;
				const actualRewardsA = await contract.rewardsBalanceOf(deployer);
				const actualRewardsB = await contract.rewardsBalanceOf(tester);
				const actualStakeA = await contract.stakedBalanceOf(deployer);
				const actualStakeB = await contract.stakedBalanceOf(tester);

				/* eslint-disable no-console */
				console.log(`totalStake: ${formatEther(data.totalStake)}`);
				console.log(`totalRewards: ${formatEther(data.totalRewards)}`);
				console.log(
					`rewardsA: ${formatEther(
						data.rewardsA,
					)}; actualRewardsA: ${formatEther(actualRewardsA)}`,
				);
				console.log(
					`rewardsB: ${formatEther(
						data.rewardsB,
					)}; actualRewardsB: ${formatEther(actualRewardsB)}`,
				);
				console.log(
					`stakeA: ${formatEther(data.stakeA)}; actualStakeA: ${formatEther(
						actualStakeA,
					)}`,
				);
				console.log(
					`stakeB: ${formatEther(data.stakeB)}; actualStakeB: ${formatEther(
						actualStakeB,
					)}`,
				);

				expect(data.totalRewards, 'rewards mismatch').to.eq(
					actualRewardsA.add(actualRewardsB),
				);
				expect(data.totalStake, 'stake mismatch').to.eq(
					actualStakeA.add(actualStakeB),
				);
			});
		});

		describe('when new rewards > stake', function () {
			it('with staggered entry');
		});
	});
}
