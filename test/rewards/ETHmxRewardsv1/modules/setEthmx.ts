import { expect } from 'chai';

import { Fixture, loadFixture } from '../common';
import { zeroPadAddress } from '../../../helpers/address';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('can only be called by owner', async function () {
		const { testerContract } = fixture;
		const address = zeroPadAddress('0x1');
		await expect(testerContract.setEthmx(address)).to.be.revertedWith(
			'caller is not the owner',
		);
	});

	it('should update ETHmx address', async function () {
		const { contract } = fixture;
		const address = zeroPadAddress('0x1');
		await contract.setEthmx(address);
		expect(await contract.ethmx()).to.eq(address);
	});

	it('should emit ETHmxSet event', async function () {
		const { contract, deployer } = fixture;
		const address = zeroPadAddress('0x1');
		await expect(contract.setEthmx(address))
			.to.emit(contract, 'ETHmxSet')
			.withArgs(deployer, address);
	});
}
