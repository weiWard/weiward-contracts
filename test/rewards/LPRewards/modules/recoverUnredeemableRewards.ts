import { expect } from 'chai';

import {
	Fixture,
	loadFixture,
	addRewards,
	parseRewardsToken,
} from '../common';

export default function run(): void {
	let fixture: Fixture;
	const amount = parseRewardsToken('10');

	beforeEach(async function () {
		fixture = await loadFixture();

		const { contract, rewardsToken } = fixture;

		await addRewards(fixture, amount);
		await contract.updateAccrual();

		expect(
			await contract.unredeemableRewards(),
			'unredeemable rewards mismatch before recovery',
		).to.eq(amount);

		expect(
			await rewardsToken.balanceOf(contract.address),
			'contract rewards balance mismatch before recovery',
		).to.eq(amount);
	});

	it('should recover unredeemable rewards', async function () {
		const { contract, tester, rewardsToken } = fixture;

		await contract.recoverUnredeemableRewards(tester, amount);

		expect(
			await contract.unredeemableRewards(),
			'unredeemable rewards mismatch after recovery',
		).to.eq(0);

		expect(
			await rewardsToken.balanceOf(contract.address),
			'contract rewardsToken balance mismatch after recovery',
		).to.eq(0);

		expect(
			await rewardsToken.balanceOf(tester),
			'target rewardsToken balance mismatch',
		).to.eq(amount);
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
		).to.be.revertedWith('recovery amount > unredeemable');
	});

	it('can only be called by owner', async function () {
		const { testerContract, tester } = fixture;

		await expect(
			testerContract.recoverUnredeemableRewards(tester, amount),
		).to.be.revertedWith('caller is not the owner');
	});
}
