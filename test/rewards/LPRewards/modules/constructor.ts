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
			sushiswapPool,
			mooniswapPool,
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
		expect(
			await contract.stakingTokenAt(0),
			'mooniswap pool token mismatch',
		).to.eq(mooniswapPool.address);
		expect(
			await contract.stakingTokenAt(1),
			'sushiswap pool token mismatch',
		).to.eq(sushiswapPool.address);
		expect(
			await contract.stakingTokenAt(2),
			'uniswap pool token mismatch',
		).to.eq(uniswapPool.address);

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
		expect(
			await uniswapPool.balanceOf(deployer),
			'uniswap pool token balance mismatch',
		).to.eq(0);
		expect(
			await sushiswapPool.balanceOf(deployer),
			'sushiswap pool token balance mismatch',
		).to.eq(0);
		expect(
			await mooniswapPool.balanceOf(deployer),
			'mooniswap pool token balance mismatch',
		).to.eq(0);

		// Check liquidity
		expect(
			await uniswapPool.totalSupply(),
			'uniswap pool totalSupply mismatch',
		).to.eq(0);
		expect(
			await sushiswapPool.totalSupply(),
			'sushiswap pool totalSupply mismatch',
		).to.eq(0);
		expect(
			await mooniswapPool.totalSupply(),
			'mooniswap pool totalSupply mismatch',
		).to.eq(0);

		// Check owner address
		expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);

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
