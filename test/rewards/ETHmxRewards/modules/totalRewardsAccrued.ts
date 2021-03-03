import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';
import { MaxUint256 } from '@ethersproject/constants';

import { Fixture, loadFixture, addRewards } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should increase when WETH is received', async function () {
		const { contract } = fixture;
		const amount = parseEther('10');
		await addRewards(fixture, amount);
		expect(await contract.totalRewardsAccrued()).to.eq(amount);
	});

	it('should handle overflow', async function () {
		const { contract } = fixture;

		await contract.setTotalRewardsRedeemed(MaxUint256);
		expect(await contract.totalRewardsAccrued()).to.eq(MaxUint256);

		const amount = parseEther('10');
		await addRewards(fixture, amount);

		expect(await contract.totalRewardsAccrued()).to.eq(amount.sub(1));
	});
}
