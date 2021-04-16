import { expect } from 'chai';

import { Fixture, loadFixture } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should revert on proxy address', async function () {
		const { contract, tester } = fixture;

		await expect(contract.init(tester)).to.be.revertedWith(
			'contract is already initialized',
		);
	});

	it('should revert on implementation address', async function () {
		const { contractImpl, tester } = fixture;

		await expect(contractImpl.init(tester)).to.be.revertedWith(
			'contract is already initialized',
		);
	});
}
