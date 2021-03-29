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
	let staked: BigNumber;
	const rewards = parseRewardsToken('10');

	beforeEach(async function () {
		fixture = await loadFixture();

		const { contract } = fixture;

		await addRewards(fixture, rewards);

		const amountB = parseTokenB('10');
		const amountA = ethToEthtx(parseGwei('100'), amountB);
		staked = await uniStake(fixture, amountA, amountB);

		await contract.updateAccrual();
	});

	it('should unstake all for token', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await expect(contract.exitFrom(uniswapPool.address))
			.to.emit(contract, 'Unstaked')
			.withArgs(deployer, uniswapPool.address, staked);
	});

	it('should redeem all rewards for token', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await expect(contract.exitFrom(uniswapPool.address))
			.to.emit(contract, 'RewardPaid')
			.withArgs(deployer, uniswapPool.address, rewards.sub(1));
	});
}
