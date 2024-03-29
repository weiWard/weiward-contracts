import { expect } from 'chai';

import { Fixture, loadFixture, roundingMultiplier } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('initial state is correct', async function () {
		const {
			deployer,
			contract,
			rewardsToken,
			tokenA,
			tokenB,
			uniswapPool,
			valuePerUNIV2,
			sushiswapPool,
			valuePerSushi,
			mooniswapPool,
			valuePerMoonV1,
			valuePerTest,
		} = fixture;

		// Check tokens
		expect(
			await contract.rewardsToken(),
			'rewards token address mismatch',
		).to.eq(rewardsToken.address);

		expect(
			await contract.numStakingTokens(),
			'numStakingTokens mismatch',
		).to.eq(3);

		// Check state for liquidity pools
		const pools = [
			{
				name: 'mooniswap',
				contract: mooniswapPool,
				valuePerToken: valuePerMoonV1,
			},
			{
				name: 'sushiswap',
				contract: sushiswapPool,
				valuePerToken: valuePerSushi,
			},
			{
				name: 'uniswap',
				contract: uniswapPool,
				valuePerToken: valuePerUNIV2,
			},
		];

		for (let i = 0; i < pools.length; i++) {
			const pool = pools[i];
			const poolAddress = pool.contract.address;
			const vptAddress = pool.valuePerToken.address;

			// Verify token is supported
			expect(
				await contract.stakingTokenAt(i),
				`${pool.name} pool token mismatch`,
			).to.eq(poolAddress);

			// Check value per token implementation
			expect(
				await contract.valuePerTokenImplFor(poolAddress),
				'mooniswap pool wrong valuePerTokenImpl',
			).to.eq(vptAddress);

			// Ensure that valuePerTest is unique
			expect(
				valuePerTest.address,
				`valuePerTest is ${pool.name} valuePerToken`,
			).to.not.eq(vptAddress);

			// Token balances
			expect(
				await pool.contract.balanceOf(deployer),
				`${pool.name} pool token balance mismatch`,
			).to.eq(0);

			// Total liquidity
			expect(
				await pool.contract.totalSupply(),
				`${pool.name} pool totalSupply mismatch`,
			).to.eq(0);
		}

		// Check rounding multiplier
		expect(await contract.multiplier(), 'rounding multiplier mismatch').to.eq(
			roundingMultiplier,
		);

		// Check token balances
		expect(
			await rewardsToken.balanceOf(deployer),
			'rewards token balance mismatch',
		).to.eq(0);
		expect(await tokenA.balanceOf(deployer), 'tokenA balance mismatch').to.eq(
			0,
		);
		expect(await tokenB.balanceOf(deployer), 'tokenB balance mismatch').to.eq(
			0,
		);

		// Check owner address
		expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);
		expect(await mooniswapPool.owner(), `mooniswap pool owner mismatch`).to.eq(
			deployer,
		);

		// Check pause state
		expect(await contract.paused(), 'paused mismatch').to.eq(false);

		// Check staking
		expect(
			await contract.currentTotalShares(),
			'total shares is nonzero',
		).to.eq(0);

		// Check rewards
		expect(
			await contract.totalRewardsAccrued(),
			'totalRewardsAccrued is nonzero',
		).to.eq(0);
		expect(
			await contract.totalRewardsRedeemed(),
			'totalRewardsRedeemed is nonzero',
		).to.eq(0);
	});
}
