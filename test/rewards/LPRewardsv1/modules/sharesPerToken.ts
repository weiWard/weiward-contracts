import { expect } from 'chai';

import { Fixture, loadFixture } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should return zero on unsupported token', async function () {
		const { contract, testPool } = fixture;

		expect(await contract.supportsStakingToken(testPool.address)).to.be.false;

		expect(await contract.sharesPerToken(testPool.address)).to.eq(0);
	});
}
