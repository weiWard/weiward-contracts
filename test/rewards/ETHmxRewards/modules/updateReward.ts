import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';
import { MaxUint256, Zero } from '@ethersproject/constants';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';

import {
	Fixture,
	loadFixture,
	addRewards,
	stake,
	roundingFactor,
} from '../common';

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

		it('should update lastRewardsBalanceOf', async function () {
			const { contract, deployer } = fixture;
			expect(await contract.lastRewardsBalanceOf(deployer)).to.eq(rewards);
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

		it('should update lastRewardsBalanceOf', async function () {
			const { contract, deployer } = fixture;
			expect(await contract.lastRewardsBalanceOf(deployer)).to.eq(staked);
		});
	});

	it('when new rewards > stake mid-loop', async function () {
		const { contract, deployer } = fixture;
		const staked = parseEther('10');

		await stake(fixture, staked);
		await addRewards(fixture, staked.div(2));
		await contract.mockUpdateAccrual();

		await addRewards(fixture, staked.mul(2));
		await contract.mockUpdateAccrual();
		await contract.updateReward();

		expect(
			await contract.stakedBalanceOf(deployer),
			'stakedBalanceOf mismatch',
		).to.eq(0);
		expect(
			await contract.lastRewardsBalanceOf(deployer),
			'lastRewardsBalanceOf mismatch',
		).to.eq(staked);
	});

	it('should be correct with multiple parties', async function () {
		const staked = parseEther('50');
		const rewards = parseEther('7');

		interface BalanceData {
			fixture: Fixture;
			checkpoint: number;
			totalStake: BigNumberish;
			stakeA: BigNumber;
			stakeB: BigNumber;
			totalRewards: BigNumberish;
			rewardsA: BigNumber;
			rewardsB: BigNumber;
			error: BigNumberish;
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
			error,
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
				await contract.lastRewardsBalanceOf(deployer),
				`checkpoint ${checkpoint}: deployer lastRewardsBalanceOf mismatch`,
			)
				.to.be.gte(rewardsA.sub(error))
				.and.lte(rewardsA);

			expect(
				await contract.lastRewardsBalanceOf(tester),
				`checkpoint ${checkpoint}: tester lastRewardsBalanceOf mismatch`,
			)
				.to.be.gte(rewardsB.sub(error))
				.and.lte(rewardsB);

			expect(
				await contract.stakedBalanceOf(deployer),
				`checkpoint ${checkpoint}: deployer stakedBalanceOf mismatch`,
			)
				.to.be.gte(stakeA.sub(error))
				.and.lte(stakeA);

			expect(
				await contract.stakedBalanceOf(tester),
				`checkpoint ${checkpoint}: tester stakedBalanceOf mismatch`,
			)
				.to.be.gte(stakeB.sub(error))
				.and.lte(stakeB);
		}

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
			error: 3,
		};

		await stake(fixture, staked);
		data.stakeA = staked;
		data.totalStake = staked;

		await addRewards(fixture, rewards);
		data.totalRewards = rewards;

		await contract.mockUpdateAccrual();
		data.totalStake = data.totalStake.sub(rewards);

		data.checkpoint = 1;
		await checkBalances(data);

		await stake(fixture, staked, testerSigner);
		data.stakeB = staked;
		data.totalStake = data.totalStake.add(staked);
		const totalStake1 = data.totalStake;

		await addRewards(fixture, rewards);
		data.totalRewards = data.totalRewards.add(rewards);

		await contract.mockUpdateAccrual();
		data.totalStake = data.totalStake.sub(rewards);
		const totalStake2 = data.totalStake;

		await contract.updateReward();
		// From first rewards
		data.stakeA = data.stakeA.sub(rewards);
		data.rewardsA = rewards;
		// From second rewards
		let newRewardsA = rewards.mul(data.stakeA).div(totalStake1);
		data.rewardsA = data.rewardsA.add(newRewardsA);
		data.stakeA = data.stakeA.sub(newRewardsA);

		data.checkpoint = 2;
		await checkBalances(data);

		await addRewards(fixture, rewards);
		data.totalRewards = data.totalRewards.add(rewards);

		await contract.mockUpdateAccrual();
		data.totalStake = data.totalStake.sub(rewards);

		await testerContract.updateReward();
		// From second rewards
		data.rewardsB = rewards.mul(data.stakeB).div(totalStake1);
		// From third rewards
		data.stakeB = data.stakeB.sub(data.rewardsB);
		const newRewardsB = rewards.mul(data.stakeB).div(totalStake2);
		data.rewardsB = data.rewardsB.add(newRewardsB);
		data.stakeB = data.stakeB.sub(newRewardsB);

		data.checkpoint = 3;
		await checkBalances(data);

		await contract.updateReward();
		// From third rewards
		newRewardsA = rewards.mul(data.stakeA).div(totalStake2);
		data.rewardsA = data.rewardsA.add(newRewardsA);
		data.stakeA = data.stakeA.sub(newRewardsA);

		data.checkpoint = 4;
		await checkBalances(data);

		const { deployer, tester } = fixture;
		const actualRewardsA = await contract.rewardsBalanceOf(deployer);
		const actualRewardsB = await contract.rewardsBalanceOf(tester);
		const actualStakeA = await contract.stakedBalanceOf(deployer);
		const actualStakeB = await contract.stakedBalanceOf(tester);

		const allocatedRewards = actualRewardsA.add(actualRewardsB);
		expect(allocatedRewards, 'intermediate allocated rewards mismatch')
			.to.be.gte(data.totalRewards.sub(data.error))
			.and.lte(data.totalRewards);

		const allocatedStake = actualStakeA.add(actualStakeB);
		const expectedError = data.totalRewards.sub(allocatedRewards);
		expect(allocatedStake, 'intermediate allocated stake mismatch').to.eq(
			data.totalStake.add(expectedError),
		);

		const excessRewards = data.totalStake.add(rewards);
		await addRewards(fixture, excessRewards);
		data.totalRewards = data.totalRewards.add(excessRewards);

		await contract.mockUpdateAccrual();
		data.totalStake = 0;

		expect(
			await contract.unredeemableRewards(),
			'unredeemable mismatch',
		).to.eq(rewards);

		await contract.updateReward();
		// From fourth rewards
		data.rewardsA = data.rewardsA.add(data.stakeA);
		data.stakeA = Zero;

		data.checkpoint = 5;
		await checkBalances(data);

		await testerContract.updateReward();
		// From fourth rewards
		data.rewardsB = data.rewardsB.add(data.stakeB);
		data.stakeB = Zero;

		data.checkpoint = 6;
		await checkBalances(data);

		expect(data.rewardsA, 'final rewardsA mismatch').to.eq(staked);
		expect(data.rewardsB, 'final rewardsB mismatch').to.eq(staked);

		const { ethmx, weth } = fixture;

		expect(
			await ethmx.balanceOf(contract.address),
			'final ETHmx balance mismatch',
		).to.eq(0);

		const rewardsBalance = await weth.balanceOf(contract.address);
		expect(rewardsBalance, 'final rewards balance mismatch').to.eq(
			data.totalRewards,
		);

		expect(
			rewardsBalance.sub(data.rewardsA).sub(data.rewardsB),
			'final unredeemable rewards balance mismatch',
		).to.eq(rewards);
	});
}
