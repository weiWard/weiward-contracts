import { expect } from 'chai';
import { BigNumber } from '@ethersproject/bignumber';

import {
	Fixture,
	loadFixture,
	addRewards,
	parseRewardsToken,
	parseTokenB,
	uniStake,
	moonStake,
} from '../common';
import { ethToEthtx, parseGwei } from '../../../helpers/conversions';

export default function run(): void {
	let fixture: Fixture;
	let uniRewards: BigNumber;
	let moonRewards: BigNumber;
	const rewards = parseRewardsToken('10');

	beforeEach(async function () {
		fixture = await loadFixture();

		const { contract, uniswapPool, mooniswapPool } = fixture;

		const amountB = parseTokenB('10');
		const amountA = ethToEthtx(parseGwei('100'), amountB);
		await uniStake(fixture, amountA, amountB);
		await moonStake(fixture, amountA, amountB);

		const uniShare = await contract.totalSharesForToken(uniswapPool.address);
		const moonShare = await contract.totalSharesForToken(
			mooniswapPool.address,
		);
		const totalShare = uniShare.add(moonShare);

		uniRewards = rewards.mul(uniShare).div(totalShare).sub(1);
		moonRewards = rewards.mul(moonShare).div(totalShare).sub(1);

		await addRewards(fixture, rewards);

		await contract.updateAccrual();
	});

	it('should update accruedRewardsPerTokenLastFor', async function () {
		const { contract, deployer, uniswapPool, mooniswapPool } = fixture;

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
			'uni mismatch',
		).to.eq(uniArpt);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				mooniswapPool.address,
			),
			'moon mismatch',
		).to.eq(moonArpt);
	});

	it('should update lastRewardsBalanceOf', async function () {
		const { contract, deployer } = fixture;

		expect(
			await contract.lastRewardsBalanceOf(deployer),
			'mismatch before update',
		).to.eq(0);

		await contract.updateReward();

		expect(
			await contract.lastRewardsBalanceOf(deployer),
			'mismatch after update',
		).to.eq(uniRewards.add(moonRewards));
	});

	it('should update lastRewardsBalanceOfFor', async function () {
		const { contract, deployer, uniswapPool, mooniswapPool } = fixture;

		expect(
			await contract.lastRewardsBalanceOfFor(deployer, uniswapPool.address),
			'uni mismatch before update',
		).to.eq(0);

		expect(
			await contract.lastRewardsBalanceOfFor(deployer, mooniswapPool.address),
			'moon mismatch before update',
		).to.eq(0);

		await contract.updateReward();

		expect(
			await contract.lastRewardsBalanceOfFor(deployer, uniswapPool.address),
			'uni mismatch after update',
		).to.eq(uniRewards);

		expect(
			await contract.lastRewardsBalanceOfFor(deployer, mooniswapPool.address),
			'moon mismatch after update',
		).to.eq(moonRewards);
	});

	it('should keep rewardsBalanceOf constant', async function () {
		const { contract, deployer } = fixture;

		expect(
			await contract.rewardsBalanceOf(deployer),
			'mismatch before update',
		).to.eq(uniRewards.add(moonRewards));

		await contract.updateReward();

		expect(
			await contract.rewardsBalanceOf(deployer),
			'mismatch after update',
		).to.eq(uniRewards.add(moonRewards));
	});

	it('should keep rewardsBalanceOfFor constant', async function () {
		const { contract, deployer, uniswapPool, mooniswapPool } = fixture;

		expect(
			await contract.rewardsBalanceOfFor(deployer, uniswapPool.address),
			'uni mismatch before update',
		).to.eq(uniRewards);

		expect(
			await contract.rewardsBalanceOfFor(deployer, mooniswapPool.address),
			'moon mismatch before update',
		).to.eq(moonRewards);

		await contract.updateReward();

		expect(
			await contract.rewardsBalanceOfFor(deployer, uniswapPool.address),
			'uni mismatch after update',
		).to.eq(uniRewards);

		expect(
			await contract.rewardsBalanceOfFor(deployer, mooniswapPool.address),
			'moon mismatch after update',
		).to.eq(moonRewards);
	});
}
