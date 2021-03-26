import { expect } from 'chai';
import { BigNumber } from '@ethersproject/bignumber';

import {
	Fixture,
	loadFixture,
	uniStake,
	addRewards,
	parseRewardsToken,
	parseTokenB,
} from '../common';
import { ethToEthtx, parseGwei } from '../../../helpers/conversions';

export default function run(): void {
	let fixture: Fixture;
	let stakedAmount: BigNumber;

	beforeEach(async function () {
		fixture = await loadFixture();

		const amountB = parseTokenB('10');
		const amountA = ethToEthtx(parseGwei('100'), amountB);
		stakedAmount = await uniStake(fixture, amountA, amountB);
	});

	it('should transfer correct amount', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await contract.unstakeAllFrom(uniswapPool.address);

		expect(
			await uniswapPool.balanceOf(deployer),
			'deployer balance mismatch',
		).to.eq(stakedAmount);

		expect(
			await uniswapPool.balanceOf(contract.address),
			'contract balance mismatch',
		).to.eq(0);
	});

	it('should transfer with previously supported token', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await contract.removeToken(uniswapPool.address);

		await contract.unstakeAllFrom(uniswapPool.address);

		expect(
			await uniswapPool.balanceOf(deployer),
			'deployer balance mismatch',
		).to.eq(stakedAmount);

		expect(
			await uniswapPool.balanceOf(contract.address),
			'contract balance mismatch',
		).to.eq(0);
	});

	it('should zero accruedRewardsPerTokenLastFor', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await addRewards(fixture, parseRewardsToken('10'));
		await contract.updateAccrual();
		const arpt = await contract.accruedRewardsPerTokenFor(uniswapPool.address);

		await contract.updateReward();

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
			'mismatch before unstake',
		).to.eq(arpt);

		await contract.unstakeAllFrom(uniswapPool.address);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
			'mismatch after unstake',
		).to.eq(0);
	});

	it('should zero stakedBalanceOf', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await contract.unstakeAllFrom(uniswapPool.address);

		expect(
			await contract.stakedBalanceOf(deployer, uniswapPool.address),
		).to.eq(0);
	});

	it('should emit Unstaked event', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await expect(contract.unstakeAllFrom(uniswapPool.address))
			.to.emit(contract, 'Unstaked')
			.withArgs(deployer, uniswapPool.address, stakedAmount);
	});
}
