import { expect } from 'chai';

import { Fixture, loadFixture, accrualUpdateInterval } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should update accrualUpdateInterval', async function () {
		const { contract } = fixture;
		const interval = 60;
		expect(interval).to.not.eq(accrualUpdateInterval);
		await contract.setAccrualUpdateInterval(interval);
		expect(await contract.accrualUpdateInterval()).to.eq(interval);
	});

	it('should emit AccrualUpdateIntervalSet event', async function () {
		const { contract, deployer } = fixture;
		const interval = 60;
		await expect(contract.setAccrualUpdateInterval(interval))
			.to.emit(contract, 'AccrualUpdateIntervalSet')
			.withArgs(deployer, interval);
	});

	it('can only be called by owner', async function () {
		const { testerContract } = fixture;
		await expect(
			testerContract.setAccrualUpdateInterval(60),
		).to.be.revertedWith('caller is not the owner');
	});
}
