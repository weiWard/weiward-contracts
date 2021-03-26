import { expect } from 'chai';

import { Fixture, loadFixture } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should update paused', async function () {
		const { contract } = fixture;
		expect(await contract.paused(), 'mismatch before call').to.be.false;
		await contract.pause();
		expect(await contract.paused(), 'failed to update paused').to.be.true;
	});

	it('should revert when paused', async function () {
		const { contract } = fixture;
		await contract.pause();
		await expect(contract.pause()).to.be.revertedWith('paused');
	});

	it('can only be called by owner', async function () {
		const { testerContract } = fixture;
		await expect(testerContract.pause()).to.be.revertedWith(
			'caller is not the owner',
		);
	});
}
