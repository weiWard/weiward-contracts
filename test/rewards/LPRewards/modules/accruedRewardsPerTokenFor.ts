import { expect } from 'chai';

import { Fixture, loadFixture, uniAddLiquidity } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe.only('should return zero', function () {
		afterEach(async function () {
			const { contract, tokenA } = fixture;
			expect(
				await contract.accruedRewardsPerTokenFor(tokenA.address),
				'accruedRewardsPerTokenFor is nonzero',
			).to.eq(0);
		});

		describe('when totalRewardsAccruedFor is zero', function () {
			afterEach(async function () {
				const { contract, tokenA } = fixture;
				expect(
					await contract.totalRewardsAccruedFor(tokenA.address),
					'totalRewardsAccruedFor is nonzero',
				).to.eq(0);
			});

			it('initially', async function () {
				return;
			});

			it('while staking', async function () {
				const { contract, uniswapPool } = fixture;
				const amount = await uniAddLiquidity(fixture);
				await uniswapPool.approve(contract.address, amount);
				await contract.stake(uniswapPool.address, amount);
			});
		});

		it('with rewards when totalStakedFor is zero');

		it('with staking after new rewards');

		it('when rewards accrue for a different token');
	});
}
