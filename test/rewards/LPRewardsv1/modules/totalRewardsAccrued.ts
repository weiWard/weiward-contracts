import { expect } from 'chai';
import { MaxUint256 } from '@ethersproject/constants';

import {
	Fixture,
	loadFixture,
	parseRewardsToken,
	addRewards,
} from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should increase when rewards are received', async function () {
		const { contract } = fixture;
		const amount = parseRewardsToken('10');
		await addRewards(fixture, amount);
		expect(await contract.totalRewardsAccrued()).to.eq(amount);
	});

	it('should handle overflow', async function () {
		const { contract } = fixture;

		await contract.setTotalRewardsRedeemed(MaxUint256);

		const amount = parseRewardsToken('10');
		await addRewards(fixture, amount);

		expect(await contract.totalRewardsAccrued()).to.eq(amount.sub(1));
	});
}
