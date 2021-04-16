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
			testerContract.postInit({
				ethmx: zeroAddress,
				weth: zeroAddress,
				accrualUpdateInterval: 0,
			}),
		).to.be.revertedWith('caller is not the owner');
	});
}
