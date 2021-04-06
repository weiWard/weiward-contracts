import { expect } from 'chai';

import { Fixture, loadFixture } from '../common';
import { zeroAddress } from '../../../helpers/address';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('can only be called by owner', async function () {
		const { testerContract } = fixture;
		await expect(
			testerContract.setRewardsToken(zeroAddress),
		).to.be.revertedWith('caller is not the owner');
	});

	it('should set rewardsToken', async function () {
		const { contract } = fixture;
		await contract.setRewardsToken(zeroAddress);
		expect(await contract.rewardsToken()).to.eq(zeroAddress);
	});

	it('should emit RewardsTokenSet event', async function () {
		const { contract, deployer } = fixture;
		await expect(contract.setRewardsToken(zeroAddress))
			.to.emit(contract, 'RewardsTokenSet')
			.withArgs(deployer, zeroAddress);
	});
}
