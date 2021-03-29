import { expect } from 'chai';
import { BigNumber } from '@ethersproject/bignumber';

import {
	Fixture,
	loadFixture,
	uniStake,
	addRewards,
	parseRewardsToken,
	parseTokenB,
	moonStake,
} from '../common';
import { ethToEthtx, parseGwei } from '../../../helpers/conversions';

export default function run(): void {
	let fixture: Fixture;
	let uniAmount: BigNumber;
	let moonAmount: BigNumber;

	beforeEach(async function () {
		fixture = await loadFixture();

		const amountB = parseTokenB('10');
		const amountA = ethToEthtx(parseGwei('100'), amountB);
		uniAmount = await uniStake(fixture, amountA, amountB);
		moonAmount = await moonStake(fixture, amountA, amountB);
	});

	it('should transfer all staked tokens', async function () {
		const { contract, deployer, uniswapPool, mooniswapPool } = fixture;

		await contract.unstakeAll();

		expect(
			await uniswapPool.balanceOf(deployer),
			'deployer uni balance mismatch',
		).to.eq(uniAmount);
		expect(
			await uniswapPool.balanceOf(contract.address),
			'contract uni balance mismatch',
		).to.eq(0);

		expect(
			await mooniswapPool.balanceOf(deployer),
			'deployer moon balance mismatch',
		).to.eq(moonAmount);
		expect(
			await mooniswapPool.balanceOf(contract.address),
			'contract moon balance mismatch',
		).to.eq(0);
	});

	it('should transfer with previously supported token', async function () {
		const { contract, deployer, uniswapPool, mooniswapPool } = fixture;

		await contract.removeToken(uniswapPool.address);
		await contract.removeToken(mooniswapPool.address);

		await contract.unstakeAll();

		expect(
			await uniswapPool.balanceOf(deployer),
			'deployer uni balance mismatch',
		).to.eq(uniAmount);
		expect(
			await uniswapPool.balanceOf(contract.address),
			'contract uni balance mismatch',
		).to.eq(0);

		expect(
			await mooniswapPool.balanceOf(deployer),
			'deployer moon balance mismatch',
		).to.eq(moonAmount);
		expect(
			await mooniswapPool.balanceOf(contract.address),
			'contract moon balance mismatch',
		).to.eq(0);
	});

	it('should zero accruedRewardsPerTokenLastFor all tokens', async function () {
		const { contract, deployer, uniswapPool, mooniswapPool } = fixture;

		await addRewards(fixture, parseRewardsToken('10'));
		await contract.updateAccrual();
		const uniArpt = await contract.accruedRewardsPerTokenFor(
			uniswapPool.address,
		);
		const moonArpt = await contract.accruedRewardsPerTokenFor(
			mooniswapPool.address,
		);

		await contract.updateReward();

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
			'uni mismatch before unstake',
		).to.eq(uniArpt);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				mooniswapPool.address,
			),
			'moon mismatch before unstake',
		).to.eq(moonArpt);

		await contract.unstakeAll();

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
			'uni mismatch after unstake',
		).to.eq(0);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				mooniswapPool.address,
			),
			'moon mismatch after unstake',
		).to.eq(0);
	});

	it('should zero stakedBalanceOf for tokens', async function () {
		const { contract, deployer, uniswapPool, mooniswapPool } = fixture;

		await contract.unstakeAll();

		expect(
			await contract.stakedBalanceOf(deployer, uniswapPool.address),
		).to.eq(0);
		expect(
			await contract.stakedBalanceOf(deployer, mooniswapPool.address),
		).to.eq(0);
	});

	it('should emit Unstaked event for first token', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await expect(contract.unstakeAll())
			.to.emit(contract, 'Unstaked')
			.withArgs(deployer, uniswapPool.address, uniAmount);
	});

	it('should emit Unstaked event for second token', async function () {
		const { contract, deployer, mooniswapPool } = fixture;

		await expect(contract.unstakeAll())
			.to.emit(contract, 'Unstaked')
			.withArgs(deployer, mooniswapPool.address, moonAmount);
	});
}
