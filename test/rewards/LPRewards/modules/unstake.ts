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

	it('should revert when amount is zero', async function () {
		const { contract, uniswapPool } = fixture;
		await expect(contract.unstake(uniswapPool.address, 0)).to.be.revertedWith(
			'cannot unstake zero',
		);
	});

	it('should revert when amount > staked balance', async function () {
		const { contract, uniswapPool } = fixture;
		await expect(
			contract.unstake(uniswapPool.address, stakedAmount.add(1)),
		).to.be.revertedWith('cannot unstake more than staked balance');
	});

	it('should transfer correct amount', async function () {
		const { contract, deployer, uniswapPool } = fixture;
		const unstaked = stakedAmount.div(2);

		await contract.unstake(uniswapPool.address, unstaked);

		expect(
			await uniswapPool.balanceOf(deployer),
			'deployer balance mismatch',
		).to.eq(unstaked);

		expect(
			await uniswapPool.balanceOf(contract.address),
			'contract balance mismatch',
		).to.eq(stakedAmount.sub(unstaked));
	});

	it('should transfer with previously supported token', async function () {
		const { contract, deployer, uniswapPool } = fixture;
		const unstaked = stakedAmount.div(2);

		await contract.removeToken(uniswapPool.address);

		await contract.unstake(uniswapPool.address, unstaked);

		expect(
			await uniswapPool.balanceOf(deployer),
			'deployer balance mismatch',
		).to.eq(unstaked);

		expect(
			await uniswapPool.balanceOf(contract.address),
			'contract balance mismatch',
		).to.eq(stakedAmount.sub(unstaked));
	});

	it('should update accruedRewardsPerTokenLastFor', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await addRewards(fixture, parseRewardsToken('10'));
		await contract.updateAccrual();
		const arpt = await contract.accruedRewardsPerTokenFor(uniswapPool.address);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
			'mismatch before unstake',
		).to.eq(0);

		await contract.unstake(uniswapPool.address, 1);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
			'mismatch after unstake',
		).to.eq(arpt);
	});

	it('should zero accruedRewardsPerTokenLastFor when unstaking all', async function () {
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

		await contract.unstake(uniswapPool.address, stakedAmount);

		expect(
			await contract.accruedRewardsPerTokenLastFor(
				deployer,
				uniswapPool.address,
			),
			'mismatch after unstake',
		).to.eq(0);
	});

	it('should update stakedBalanceOf', async function () {
		const { contract, deployer, uniswapPool } = fixture;
		const unstaked = stakedAmount.div(2);

		await contract.unstake(uniswapPool.address, unstaked);

		expect(
			await contract.stakedBalanceOf(deployer, uniswapPool.address),
		).to.eq(stakedAmount.sub(unstaked));
	});

	it('should emit Unstaked event', async function () {
		const { contract, deployer, uniswapPool } = fixture;
		const unstaked = stakedAmount.div(2);

		await expect(contract.unstake(uniswapPool.address, unstaked))
			.to.emit(contract, 'Unstaked')
			.withArgs(deployer, uniswapPool.address, unstaked);
	});
}
