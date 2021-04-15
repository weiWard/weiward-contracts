import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';

import { Fixture, loadFixture } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should revert', async function () {
		const { contract, deployerSigner } = fixture;
		await expect(
			deployerSigner.sendTransaction({
				to: contract.address,
				value: parseEther('1'),
			}),
		).to.be.reverted;
	});
}
