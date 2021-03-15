import { expect } from 'chai';
import { BigNumber } from '@ethersproject/bignumber';
import { MaxUint256 } from '@ethersproject/constants';

import {
	Fixture,
	loadFixture,
	uniStake,
	defaultAmounts,
	addRewards,
	moonStake,
	accruedRewardsPerToken,
	getCurrentShares,
	roundingExponent,
} from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('should return zero', function () {
		afterEach(async function () {
			const { contract, uniswapPool } = fixture;
			expect(
				await contract.accruedRewardsPerTokenFor(uniswapPool.address),
				'accruedRewardsPerTokenFor is nonzero',
			).to.eq(0);
		});

		describe('when totalRewardsAccruedFor is zero', function () {
			afterEach(async function () {
				const { contract, uniswapPool } = fixture;
				expect(
					await contract.totalRewardsAccruedFor(uniswapPool.address),
					'totalRewardsAccruedFor is nonzero',
				).to.eq(0);
			});

			it('initially', async function () {
				return;
			});

			it('while staking', async function () {
				await uniStake(fixture);
			});

			it('with rewards when totalStakedFor is zero', async function () {
				const { contract, uniswapPool } = fixture;
				await addRewards(fixture);
				// Update, since accruedRewardsPerTokenFor calls totalRewardsAccruedFor
				await contract.updateTokenRewards();
				expect(
					await contract.totalStakedFor(uniswapPool.address),
					'totalStakedFor is nonzero',
				).to.eq(0);
			});

			it('with staking after new rewards', async function () {
				await addRewards(fixture);
				await uniStake(fixture);
			});

			it('and rewards accrue for a different token', async function () {
				const { contract, mooniswapPool } = fixture;
				await moonStake(fixture);
				const amount = await addRewards(fixture);
				// Update, since accruedRewardsPerTokenFor calls totalRewardsAccruedFor
				await contract.updateTokenRewards();
				expect(
					await contract.totalRewardsAccruedFor(mooniswapPool.address),
					'totalRewardsAccruedFor(mooniswapPool) mismatch',
				).to.eq(amount);
			});

			it('and rewards have not been updated', async function () {
				await uniStake(fixture);
				await addRewards(fixture);
				// Don't call contract.updateTokenRewards()
			});
		});
	});

	describe('should be constant', function () {
		let stakedAmount: BigNumber;
		let expected: BigNumber;

		beforeEach(async function () {
			const { contract, uniswapPool } = fixture;
			stakedAmount = await uniStake(fixture);
			await addRewards(fixture);

			await contract.updateTokenRewards();

			expected = accruedRewardsPerToken(stakedAmount);

			expect(expected, 'expected value is zero').to.not.eq(0);

			expect(
				await contract.accruedRewardsPerTokenFor(uniswapPool.address),
				'accruedRewardsPerTokenFor mismatch before adding new rewards',
			).to.eq(expected);
		});

		afterEach(async function () {
			const { contract, uniswapPool } = fixture;
			expect(
				await contract.accruedRewardsPerTokenFor(uniswapPool.address),
				'accruedRewardsPerTokenFor mismatch after adding new rewards',
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
			await contract.updateTokenRewards();
		});

		it('when rewards have not been updated', async function () {
			await addRewards(fixture);
		});
	});

	describe('should be correct', function () {
		let stakedAmount: BigNumber;
		let expected: BigNumber;

		beforeEach(async function () {
			stakedAmount = await uniStake(fixture);
			await addRewards(fixture);
			expected = accruedRewardsPerToken(stakedAmount);
		});

		afterEach(async function () {
			const { contract, uniswapPool } = fixture;
			await contract.updateTokenRewards();
			expect(
				await contract.accruedRewardsPerTokenFor(uniswapPool.address),
				'accruedRewardsPerTokenFor uniswapPool mismatch',
			).to.eq(expected);
		});

		it('when totalRewardsAccruedFor increases', async function () {
			await addRewards(fixture);
			expected = expected.add(accruedRewardsPerToken(stakedAmount)).add(1);
		});

		describe('when totalStakedFor same token', function () {
			it('is constant', async function () {
				return;
			});

			it('increases', async function () {
				stakedAmount = stakedAmount.add(await uniStake(fixture));
				await addRewards(fixture);
				expected = expected.add(accruedRewardsPerToken(stakedAmount));
			});

			it('decreases', async function () {
				const { contract, uniswapPool } = fixture;
				const amount = stakedAmount.div(2);
				await contract.unstake(uniswapPool.address, amount);
				await addRewards(fixture);
				stakedAmount = stakedAmount.sub(amount);
				expected = expected.add(accruedRewardsPerToken(stakedAmount));
			});
		});

		describe('when totalStakedFor different token', function () {
			let otherStakedAmount: BigNumber;
			let otherExpected: BigNumber;

			beforeEach(async function () {
				otherStakedAmount = await moonStake(fixture);
				await addRewards(fixture);

				const {
					moon: moonShares,
					uni: uniShares,
					total: totalShares,
				} = await getCurrentShares(fixture);

				const uniRewards = defaultAmounts.rewards
					.mul(uniShares)
					.div(totalShares);
				const moonRewards = defaultAmounts.rewards
					.mul(moonShares)
					.div(totalShares);

				expected = expected
					.add(accruedRewardsPerToken(stakedAmount, uniRewards))
					.add(1);
				otherExpected = accruedRewardsPerToken(otherStakedAmount, moonRewards);
			});

			afterEach(async function () {
				const { contract, mooniswapPool } = fixture;
				await contract.updateTokenRewards();
				expect(
					await contract.accruedRewardsPerTokenFor(mooniswapPool.address),
					'accruedRewardsPerTokenFor mooniswapPool mismatch',
				).to.eq(otherExpected);
			});

			it('is constant', async function () {
				return;
			});

			it('increases', async function () {
				otherStakedAmount = otherStakedAmount.add(await moonStake(fixture));
				await addRewards(fixture);

				const {
					moon: moonShares,
					uni: uniShares,
					total: totalShares,
				} = await getCurrentShares(fixture);

				expected = expected.add(
					accruedRewardsPerToken(
						stakedAmount,
						defaultAmounts.rewards.mul(uniShares).div(totalShares),
					),
				);
				otherExpected = otherExpected.add(
					accruedRewardsPerToken(
						otherStakedAmount,
						defaultAmounts.rewards.mul(moonShares).div(totalShares),
					),
				);
			});

			it('decreases', async function () {
				const { contract, mooniswapPool } = fixture;
				const amount = otherStakedAmount.div(2);
				await contract.unstake(mooniswapPool.address, amount);
				otherStakedAmount = otherStakedAmount.sub(amount);
				await addRewards(fixture);

				const {
					moon: moonShares,
					uni: uniShares,
					total: totalShares,
				} = await getCurrentShares(fixture);

				expected = expected.add(
					accruedRewardsPerToken(
						stakedAmount,
						defaultAmounts.rewards.mul(uniShares).div(totalShares),
					),
				);
				otherExpected = otherExpected.add(
					accruedRewardsPerToken(
						otherStakedAmount,
						defaultAmounts.rewards.mul(moonShares).div(totalShares),
					),
				);
			});
		});
	});

	describe('handles overflow', function () {
		it('should succeed when rewards increase is near overflow limit', async function () {
			const { contract, uniswapPool } = fixture;
			const amount = BigNumber.from(10).pow(77 - roundingExponent);
			const staked = await uniStake(fixture);
			await addRewards(fixture, amount);
			await contract.updateTokenRewards();

			const expected = accruedRewardsPerToken(staked, amount);
			expect(
				await contract.accruedRewardsPerTokenFor(uniswapPool.address),
			).to.eq(expected);
		});

		it('should revert when rewards increase > overflow limit', async function () {
			const { contract, uniswapPool } = fixture;
			const amount = BigNumber.from(10).pow(77 - (roundingExponent - 1));
			await uniStake(fixture);
			await addRewards(fixture, amount);
			await contract.updateTokenRewards();

			await expect(
				contract.accruedRewardsPerTokenFor(uniswapPool.address),
			).to.be.revertedWith('multiplication overflow');
		});

		describe('should be correct when', function () {
			it('accruedRewardsPerToken state overflows', async function () {
				const { contract, uniswapPool } = fixture;
				await contract.setAccruedRewardsPerTokenFor(
					uniswapPool.address,
					MaxUint256,
				);
				const staked = await uniStake(fixture);
				await addRewards(fixture);
				await contract.updateTokenRewards();

				const expected = accruedRewardsPerToken(staked).sub(1);
				expect(
					await contract.accruedRewardsPerTokenFor(uniswapPool.address),
				).to.eq(expected);
			});

			it('totalRewardsAccrued overflows', async function () {
				const { contract, uniswapPool } = fixture;
				const address = uniswapPool.address;

				await contract.setTotalRewardsRedeemed(MaxUint256);
				await contract.setLastTotalRewardsAccrued(MaxUint256);

				// Verify we're near overflow
				expect(
					await contract.totalRewardsAccrued(),
					'totalRewardsAccruedFor mismatch before overflow',
				).to.eq(MaxUint256);

				const staked = await uniStake(fixture);
				await addRewards(fixture);
				await contract.updateTokenRewards();

				// Verify overflow
				expect(
					await contract.totalRewardsAccrued(),
					'totalRewardsAccruedFor mismatch after overflow',
				).to.eq(defaultAmounts.rewards.sub(1));

				expect(
					await contract.accruedRewardsPerTokenFor(address),
					'accruedRewardsPerTokenFor mismatch',
				).to.eq(accruedRewardsPerToken(staked));
			});

			it('totalRewardsAccruedFor overflows', async function () {
				const { contract, uniswapPool } = fixture;
				const address = uniswapPool.address;

				await contract.setRewardsRedeemedFor(address, MaxUint256);
				await contract.setLastRewardsAccruedFor(address, MaxUint256);

				// Verify we're near overflow
				expect(
					await contract.totalRewardsAccruedFor(address),
					'totalRewardsAccruedFor mismatch before overflow',
				).to.eq(MaxUint256);

				const staked = await uniStake(fixture);
				await addRewards(fixture);
				await contract.updateTokenRewards();

				// Verify overflow
				expect(
					await contract.totalRewardsAccruedFor(address),
					'totalRewardsAccruedFor mismatch after overflow',
				).to.eq(defaultAmounts.rewards.sub(1));

				expect(
					await contract.accruedRewardsPerTokenFor(address),
					'accruedRewardsPerTokenFor mismatch',
				).to.eq(accruedRewardsPerToken(staked));
			});

			it('lastRewardsAccrued overflows', async function () {
				const { contract, uniswapPool } = fixture;
				const address = uniswapPool.address;

				await contract.setLastRewardsAccruedFor(address, MaxUint256);
				const staked = await uniStake(fixture);
				await addRewards(fixture);

				// Update to overflow
				await contract.updateTokenRewards();

				// Verify current
				expect(
					await contract.totalRewardsAccruedFor(address),
					'totalRewardsAccruedFor mismatch',
				).to.eq(defaultAmounts.rewards);

				const expected = accruedRewardsPerToken(staked);
				expect(
					await contract.accruedRewardsPerTokenFor(address),
					'accruedRewardsPerTokenFor mismatch after overflow',
				).to.eq(expected);
			});

			it('_lastTotalRewardsAccrued overflows', async function () {
				const { contract, uniswapPool } = fixture;
				const address = uniswapPool.address;

				await contract.setLastTotalRewardsAccrued(MaxUint256);
				const staked = await uniStake(fixture);
				await addRewards(fixture);

				// Update to overflow
				await contract.updateTokenRewards();

				// Verify current
				expect(
					await contract.totalRewardsAccrued(),
					'totalRewardsAccruedFor mismatch',
				).to.eq(defaultAmounts.rewards);

				const expected = accruedRewardsPerToken(staked);
				expect(
					await contract.accruedRewardsPerTokenFor(address),
					'accruedRewardsPerTokenFor mismatch after overflow',
				).to.eq(expected);
			});
		});
	});
}
