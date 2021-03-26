import { expect } from 'chai';

import {
	Fixture,
	loadFixture,
	addRewards,
	parseRewardsToken,
	parseTokenB,
	uniStake,
} from '../common';
import { ethToEthtx, parseGwei } from '../../../helpers/conversions';

export default function run(): void {
	let fixture: Fixture;
	const rewards = parseRewardsToken('10');
	const rewardsBalance = rewards.sub(1);

	beforeEach(async function () {
		fixture = await loadFixture();

		const { contract } = fixture;

		const amountB = parseTokenB('10');
		const amountA = ethToEthtx(parseGwei('100'), amountB);
		await uniStake(fixture, amountA, amountB);

		await addRewards(fixture, rewards);

		await contract.updateAccrual();
	});

	it('should update accruedRewardsPerTokenLastFor', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		const arpt = await contract.accruedRewardsPerTokenFor(uniswapPool.address);

		await contract.updateRewardFor(uniswapPool.address);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
		).to.eq(arpt);
	});

	it('should update lastRewardsBalanceOf', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		expect(
			await contract.lastRewardsBalanceOf(deployer),
			'mismatch before update',
		).to.eq(0);

		await contract.updateRewardFor(uniswapPool.address);

		expect(
			await contract.lastRewardsBalanceOf(deployer),
			'mismatch after update',
		).to.eq(rewardsBalance);
	});

	it('should update lastRewardsBalanceOfFor', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		expect(
			await contract.lastRewardsBalanceOfFor(deployer, uniswapPool.address),
			'mismatch before update',
		).to.eq(0);

		await contract.updateRewardFor(uniswapPool.address);

		expect(
			await contract.lastRewardsBalanceOfFor(deployer, uniswapPool.address),
			'mismatch after update',
		).to.eq(rewardsBalance);
	});

	it('should keep rewardsBalanceOf constant', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		expect(
			await contract.rewardsBalanceOf(deployer),
			'mismatch before update',
		).to.eq(rewardsBalance);

		await contract.updateRewardFor(uniswapPool.address);

		expect(
			await contract.rewardsBalanceOf(deployer),
			'mismatch after update',
		).to.eq(rewardsBalance);
	});

	it('should keep rewardsBalanceOfFor constant', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		expect(
			await contract.rewardsBalanceOfFor(deployer, uniswapPool.address),
			'mismatch before update',
		).to.eq(rewardsBalance);

		await contract.updateRewardFor(uniswapPool.address);

		expect(
			await contract.rewardsBalanceOfFor(deployer, uniswapPool.address),
			'mismatch after update',
		).to.eq(rewardsBalance);
	});
}
