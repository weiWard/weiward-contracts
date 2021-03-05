import { expect } from 'chai';
import { BigNumber } from '@ethersproject/bignumber';

import {
	addRewards,
	Fixture,
	loadFixture,
	moonStake,
	uniStake,
} from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('should return zero', function () {
		afterEach(async function () {
			const { deployer, contract } = fixture;
			expect(
				await contract.currentRewardsBalanceOf(deployer),
				'deployer balance is nonzero',
			).to.eq(0);
		});

		it('when staking without rewards', async function () {
			await uniStake(fixture);
		});

		describe('with rewards', function () {
			it('when not staking', async function () {
				await addRewards(fixture);
			});

			it('before staking', async function () {
				await addRewards(fixture);
				await uniStake(fixture);
			});

			it('when not staking and another user has staked', async function () {
				const { contract, tester } = fixture;
				await uniStake(fixture, tester);
				const amount = await addRewards(fixture);
				expect(
					await contract.currentRewardsBalanceOf(tester),
					'tester balance mismatch',
				).to.eq(amount.sub(1));
			});

			it('when not staking and another user has staked another token', async function () {
				const { contract, tester } = fixture;
				await moonStake(fixture, tester);
				const amount = await addRewards(fixture);
				expect(
					await contract.currentRewardsBalanceOf(tester),
					'tester balance mismatch',
				).to.eq(amount);
			});

			it('after redeeming all before new rewards', async function () {
				const { contract, deployer } = fixture;
				await uniStake(fixture);
				const amount = await addRewards(fixture);
				expect(
					await contract.currentRewardsBalanceOf(deployer),
					'balance mismatch before redeeming',
				).to.eq(amount.sub(1));
				await contract.redeemAllRewards();
			});

			it('after exiting', async function () {
				const { contract, deployer } = fixture;
				await uniStake(fixture);
				const amount = await addRewards(fixture);
				expect(
					await contract.currentRewardsBalanceOf(deployer),
					'balance mismatch before exiting',
				).to.eq(amount.sub(1));
				await contract.exit();
			});
		});
	});

	describe('should be constant', function () {
		it('when staking without new rewards', async function () {
			const { contract, deployer } = fixture;
			await uniStake(fixture);
			const amount = await addRewards(fixture);
			const expected = amount.sub(1);
			expect(
				await contract.currentRewardsBalanceOf(deployer),
				'balance mismatch before further stake',
			).to.eq(expected);
			await uniStake(fixture);
			expect(
				await contract.currentRewardsBalanceOf(deployer),
				'balance mismatch after further stake',
			).to.eq(expected);
		});

		it('after unstaking', async function () {
			const { contract, deployer, uniswapPool } = fixture;
			await uniStake(fixture);
			const amount = await addRewards(fixture);
			const expected = amount.sub(1);
			expect(
				await contract.currentRewardsBalanceOf(deployer),
				'balance mismatch before unstaking',
			).to.eq(expected);

			await contract.unstakeAllFrom(uniswapPool.address);
			await addRewards(fixture);
			expect(
				await contract.currentRewardsBalanceOf(deployer),
				'balance mismatch after unstaking',
			).to.eq(expected);
		});

		it('after unstaking with another user staked', async function () {
			const { contract, deployer, tester, uniswapPool } = fixture;
			await uniStake(fixture);
			await uniStake(fixture, tester);
			const rewards = await addRewards(fixture);

			const expected = rewards.div(2).sub(2);

			expect(
				await contract.currentRewardsBalanceOf(deployer),
				'balance mismatch before unstake',
			).to.eq(expected);

			await contract.unstakeAllFrom(uniswapPool.address);
			await addRewards(fixture);
			expect(
				await contract.currentRewardsBalanceOf(deployer),
				'balance mismatch after unstaking',
			).to.eq(expected);
		});

		it('after unstaking with another user staking another token', async function () {
			const { contract, deployer, tester, uniswapPool } = fixture;
			await uniStake(fixture);
			await moonStake(fixture, tester);
			const rewards = await addRewards(fixture);

			const expected = rewards.div(2).sub(3);

			expect(
				await contract.currentRewardsBalanceOf(deployer),
				'balance mismatch before unstake',
			).to.eq(expected);

			await contract.unstakeAllFrom(uniswapPool.address);
			await addRewards(fixture);
			expect(
				await contract.currentRewardsBalanceOf(deployer),
				'balance mismatch after unstaking',
			).to.eq(expected);
		});
	});

	describe('should be correct', function () {
		describe('with one token and stake is', function () {
			let stakeAmount: BigNumber;
			let rewards: BigNumber;

			beforeEach(async function () {
				stakeAmount = await uniStake(fixture);
				rewards = await addRewards(fixture);
			});

			it('initially', async function () {
				const { contract, deployer } = fixture;
				const amount = rewards.sub(1);
				expect(await contract.currentRewardsBalanceOf(deployer)).to.eq(amount);
			});

			it('constant', async function () {
				const { contract, deployer } = fixture;
				const added = await addRewards(fixture);
				const amount = rewards.add(added).sub(1);
				expect(await contract.currentRewardsBalanceOf(deployer)).to.eq(amount);
			});

			it('increased', async function () {
				const { contract, deployer } = fixture;
				await uniStake(fixture);
				const added = await addRewards(fixture);
				const amount = rewards.add(added).sub(2);
				expect(await contract.currentRewardsBalanceOf(deployer)).to.eq(amount);
			});

			it('decreased', async function () {
				const { contract, deployer, uniswapPool } = fixture;
				await contract.unstake(uniswapPool.address, stakeAmount.div(2));
				const added = await addRewards(fixture);
				const amount = rewards.add(added).sub(2);
				expect(await contract.currentRewardsBalanceOf(deployer)).to.eq(amount);
			});

			it('unstaked', async function () {
				const { contract, deployer } = fixture;
				await contract.unstakeAll();
				await addRewards(fixture);
				const amount = rewards.sub(1);
				expect(await contract.currentRewardsBalanceOf(deployer)).to.eq(amount);
			});
		});

		describe('with multiple tokens and stake is', function () {
			describe('constant', function () {
				it('with equal amounts');

				it('with different amounts');
			});

			describe('staggered entry', function () {
				it('with equal amounts');

				it('with different amounts');
			});

			describe('increased simultaneously', function () {
				it('with equal amounts');

				it('with different amounts');
			});

			describe('staggered increase', function () {
				it('with equal amounts');

				it('with different amounts');
			});

			describe('decreased simultaneously', function () {
				it('with equal amounts');

				it('with different amounts');
			});

			describe('staggered decrease', function () {
				it('with equal amounts');

				it('with different amounts');
			});

			describe('simultaneous exit', function () {
				it('with equal amounts');

				it('with different amounts');
			});

			describe('staggered exit', function () {
				it('with equal amounts');

				it('with different amounts');
			});
		});

		describe('with multiple stakers', function () {
			it('tbd');
		});

		describe('with multiple tokens and stakers', function () {
			it('tbd');
		});
	});

	describe('handles overflow', function () {
		it('tbd');
	});
}
