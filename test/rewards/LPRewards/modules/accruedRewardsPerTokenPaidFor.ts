import { expect } from 'chai';
import { BigNumber } from '@ethersproject/bignumber';

import {
	accruedRewardsPerToken,
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
			const { deployer, contract, uniswapPool } = fixture;
			expect(
				await contract.accruedRewardsPerTokenPaidFor(
					deployer,
					uniswapPool.address,
				),
				'accruedRewardsPerTokenPaidFor is nonzero',
			).to.eq(0);
		});

		it('initially', async function () {
			return;
		});

		it('when staking before rewards', async function () {
			await uniStake(fixture);
		});

		it('before staking after rewards', async function () {
			const { contract } = fixture;
			await addRewards(fixture);
			await contract.updateTokenRewards();
		});

		it('before staking after rewards after updateReward', async function () {
			const { contract } = fixture;
			await addRewards(fixture);
			await contract.updateReward();
		});

		it('after staking after rewards before updateReward', async function () {
			const { contract } = fixture;
			await uniStake(fixture);
			await addRewards(fixture);
			await contract.updateTokenRewards();
		});

		it('when another token receives rewards', async function () {
			const { deployer, contract, mooniswapPool } = fixture;
			const staked = await moonStake(fixture);
			await addRewards(fixture);
			await contract.updateReward();

			expect(
				await contract.accruedRewardsPerTokenPaidFor(
					deployer,
					mooniswapPool.address,
				),
				'accruedRewardsPerTokenPaidFor different pool mismatch',
			).to.eq(accruedRewardsPerToken(staked));
		});

		it('when another user receives rewards', async function () {
			const { tester, contract, uniswapPool } = fixture;
			const staked = await uniStake(fixture, tester);
			await addRewards(fixture);
			await contract.updateReward();
			await contract.updateRewardFor(tester);

			expect(
				await contract.accruedRewardsPerTokenPaidFor(
					tester,
					uniswapPool.address,
				),
				'accruedRewardsPerTokenPaidFor different account mismatch',
			).to.eq(accruedRewardsPerToken(staked));
		});
	});

	describe('should be constant', function () {
		let stakedAmount: BigNumber;
		let expected: BigNumber;

		beforeEach(async function () {
			const { contract, uniswapPool } = fixture;
			stakedAmount = await uniStake(fixture);
			await addRewards(fixture);

			await contract.updateReward();

			expected = accruedRewardsPerToken(stakedAmount);

			expect(expected, 'expected value is zero').to.not.eq(0);

			expect(
				await contract.accruedRewardsPerTokenFor(uniswapPool.address),
				'accruedRewardsPerTokenPaidFor mismatch before adding new rewards',
			).to.eq(expected);
		});

		afterEach(async function () {
			const { contract, uniswapPool } = fixture;
			expect(
				await contract.accruedRewardsPerTokenFor(uniswapPool.address),
				'accruedRewardsPerTokenPaidFor mismatch after adding new rewards',
			).to.eq(expected);
		});

		it('after unstaking, when totalStakedFor is zero', async function () {
			const { contract, uniswapPool } = fixture;
			await contract.unstake(uniswapPool.address, stakedAmount);
			expect(
				await contract.totalStakedFor(uniswapPool.address),
				'totalStakedFor is nonzero',
			).to.eq(0);

			await addRewards(fixture);
			await contract.updateReward();
		});
	});

	describe('should be correct', function () {
		it('after unstaking and re-staking', async function () {
			const { deployer, tester, contract, uniswapPool } = fixture;
			const deployerStaked = await uniStake(fixture);
			const testerStaked = await uniStake(fixture, tester);
			await addRewards(fixture);
			await contract.updateReward();

			let expected = accruedRewardsPerToken(deployerStaked.add(testerStaked));

			expect(
				await contract.accruedRewardsPerTokenPaidFor(
					deployer,
					uniswapPool.address,
				),
				'accruedRewardsPerTokenPaidFor before unstake mismatch',
			).to.eq(expected);

			await contract.unstake(uniswapPool.address, deployerStaked);
			await addRewards(fixture);
			await uniswapPool.approve(contract.address, deployerStaked);
			await contract.stake(uniswapPool.address, deployerStaked);

			expected = expected.add(accruedRewardsPerToken(testerStaked));

			expect(
				await contract.accruedRewardsPerTokenPaidFor(
					deployer,
					uniswapPool.address,
				),
				'accruedRewardsPerTokenPaidFor after unstake mismatch',
			).to.eq(expected);
		});
	});
}
