import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';

import { Fixture, loadFixture } from '../common';

export default function run(): void {
	let fixture: Fixture;
	const amount = parseEther('10');

	beforeEach(async function () {
		fixture = await loadFixture();

		const { contract, ethmx } = fixture;
		await ethmx.mint({ value: amount.mul(2) });

		await ethmx.increaseAllowance(contract.address, amount);
		await contract.stake(amount);

		await ethmx.transfer(contract.address, amount);

		expect(
			await ethmx.balanceOf(contract.address),
			'initial contract balance mismatch',
		).to.eq(amount.mul(2));

		expect(await contract.totalStaked(), 'initial totalStaked mismatch').to.eq(
			amount,
		);
	});

	it('should recover ETHmx', async function () {
		const { contract, tester, ethmx } = fixture;

		await contract.recoverUnstaked(tester, amount);

		expect(
			await ethmx.balanceOf(contract.address),
			'contract balance mismatch after recovery',
		).to.eq(amount);

		expect(
			await contract.totalStaked(),
			'totalStaked mismatch after recovery',
		).to.eq(amount);

		expect(await ethmx.balanceOf(tester), 'target balance mismatch').to.eq(
			amount,
		);
	});

	it('should emit RecoveredUnstaked event', async function () {
		const { contract, deployer, tester } = fixture;

		await expect(contract.recoverUnstaked(tester, amount))
			.to.emit(contract, 'RecoveredUnstaked')
			.withArgs(deployer, tester, amount);
	});

	it('should revert when amount > unstaked', async function () {
		const { contract, tester } = fixture;

		await expect(
			contract.recoverUnstaked(tester, amount.add(1)),
		).to.be.revertedWith('recovery amount greater than unstaked');
	});

	it('can only be called by owner', async function () {
		const { testerContract, tester } = fixture;

		await expect(
			testerContract.recoverUnstaked(tester, amount),
		).to.be.revertedWith('caller is not the owner');
	});
}
