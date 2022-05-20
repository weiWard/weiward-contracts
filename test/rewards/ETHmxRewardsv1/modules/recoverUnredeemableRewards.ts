import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';

import { Fixture, loadFixture } from '../common';

export default function run(): void {
	let fixture: Fixture;
	const amount = parseEther('10');

	beforeEach(async function () {
		fixture = await loadFixture();

		const { contract, weth } = fixture;
		await weth.deposit({ value: amount });
		await weth.transfer(contract.address, amount);
		await contract.updateAccrual();

		expect(
			await contract.unredeemableRewards(),
			'unredeemable rewards mismatch before recovery',
		).to.eq(amount);

		expect(
			await weth.balanceOf(contract.address),
			'contract WETH balance mismatch before recovery',
		).to.eq(amount);
	});

	it('should recover unredeemable rewards', async function () {
		const { contract, tester, weth } = fixture;

		await contract.recoverUnredeemableRewards(tester, amount);

		expect(
			await contract.unredeemableRewards(),
			'unredeemable rewards mismatch after recovery',
		).to.eq(0);

		expect(
			await weth.balanceOf(contract.address),
			'contract WETH balance mismatch after recovery',
		).to.eq(0);

		expect(await weth.balanceOf(tester), 'target WETH balance mismatch').to.eq(
			amount,
		);
	});

	it('should emit RecoveredUnredeemableRewards event', async function () {
		const { contract, deployer, tester } = fixture;

		await expect(contract.recoverUnredeemableRewards(tester, amount))
			.to.emit(contract, 'RecoveredUnredeemableRewards')
			.withArgs(deployer, tester, amount);
	});

	it('should revert when amount > unredeemable', async function () {
		const { contract, tester } = fixture;

		await expect(
			contract.recoverUnredeemableRewards(tester, amount.add(1)),
		).to.be.revertedWith('recovery amount greater than unredeemable');
	});

	it('can only be called by owner', async function () {
		const { testerContract, tester } = fixture;

		await expect(
			testerContract.recoverUnredeemableRewards(tester, amount),
		).to.be.revertedWith('caller is not the owner');
	});
}
