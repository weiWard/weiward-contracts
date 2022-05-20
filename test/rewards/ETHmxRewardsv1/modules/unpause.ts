import { expect } from 'chai';

import { Fixture, loadFixture } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should update paused', async function () {
		const { contract } = fixture;
		await contract.pause();
		expect(await contract.paused(), 'pause failed').to.be.true;
		await contract.unpause();
		expect(await contract.paused(), 'unpause failed').to.be.false;
	});

	it('should revert when unpaused', async function () {
		const { contract } = fixture;
		await expect(contract.unpause()).to.be.revertedWith('not paused');
	});

	it('can only be called by owner', async function () {
		const { testerContract } = fixture;
		await expect(testerContract.unpause()).to.be.revertedWith(
			'caller is not the owner',
		);
	});
}
