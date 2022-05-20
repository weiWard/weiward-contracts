import { expect } from 'chai';
import { BigNumber } from '@ethersproject/bignumber';

import {
	Fixture,
	loadFixture,
	uniStake,
	moonStake,
	addRewards,
	parseRewardsToken,
	parseTokenB,
} from '../common';
import { ethToEthtx, parseGwei } from '../../../helpers/conversions';

export default function run(): void {
	let fixture: Fixture;
	let uniStaked: BigNumber;
	let moonStaked: BigNumber;
	const rewards = parseRewardsToken('10');

	beforeEach(async function () {
		fixture = await loadFixture();

		const { contract } = fixture;

		await addRewards(fixture, rewards);

		const amountB = parseTokenB('10');
		const amountA = ethToEthtx(parseGwei('100'), amountB);
		uniStaked = await uniStake(fixture, amountA, amountB);
		moonStaked = await moonStake(fixture, amountA, amountB);

		await contract.updateAccrual();
	});

	it('should unstake all of first token', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await expect(contract.exit(true))
			.to.emit(contract, 'Unstaked')
			.withArgs(deployer, uniswapPool.address, uniStaked);
	});

	it('should unstake all of second token', async function () {
		const { contract, deployer, mooniswapPool } = fixture;

		await expect(contract.exit(true))
			.to.emit(contract, 'Unstaked')
			.withArgs(deployer, mooniswapPool.address, moonStaked);
	});

	it('should redeem all rewards for first token', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		const uniRewards = await contract.rewardsBalanceOfFor(
			deployer,
			uniswapPool.address,
		);

		await expect(contract.exit(true))
			.to.emit(contract, 'RewardPaid')
			.withArgs(deployer, uniswapPool.address, uniRewards);
	});

	it('should redeem all rewards for second token', async function () {
		const { contract, deployer, mooniswapPool } = fixture;

		const moonRewards = await contract.rewardsBalanceOfFor(
			deployer,
			mooniswapPool.address,
		);

		await expect(contract.exit(true))
			.to.emit(contract, 'RewardPaid')
			.withArgs(deployer, mooniswapPool.address, moonRewards);
	});
}
