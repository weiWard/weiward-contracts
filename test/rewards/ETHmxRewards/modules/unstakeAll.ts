import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';

import { parseETHmx } from '../../../helpers/conversions';
import { Fixture, loadFixture, addRewards, stake } from '../common';

export default function run(): void {
	let fixture: Fixture;
	const stakeAmount = parseETHmx('5');

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should update rewardsBalanceOf', async function () {
		const { contract, deployer, testerSigner } = fixture;
		const rewardsAmount = parseEther('7');

		let expected = rewardsAmount.div(2);
		if (expected.gt(stakeAmount)) {
			expected = stakeAmount;
		}

		await addRewards(fixture, rewardsAmount);
		await stake(fixture, stakeAmount);
		await stake(fixture, stakeAmount, testerSigner);
		await contract.updateAccrual();

		expect(
			await contract.lastRewardsBalanceOf(deployer),
			'lastRewardsBalanceOf mismatch before unstake',
		).to.eq(0);
		expect(
			await contract.rewardsBalanceOf(deployer),
			'rewardsBalanceOf mismatch before unstake',
		).to.eq(expected);

		await contract.unstakeAll();

		expect(
			await contract.lastRewardsBalanceOf(deployer),
			'lastRewardsBalanceOf mismatch after unstake',
		).to.eq(expected);
		expect(
			await contract.rewardsBalanceOf(deployer),
			'rewardsBalanceOf mismatch after unstake',
		).to.eq(expected);
	});

	it('should zero stakedBalanceOf', async function () {
		const { contract, deployer } = fixture;
		await stake(fixture, stakeAmount);
		await contract.unstakeAll();
		expect(await contract.stakedBalanceOf(deployer)).to.eq(0);
	});

	it('should update totalStaked', async function () {
		const { contract, testerSigner } = fixture;
		await stake(fixture, stakeAmount);
		await stake(fixture, stakeAmount, testerSigner);
		await contract.unstakeAll();
		expect(await contract.totalStaked()).to.eq(stakeAmount);
	});

	describe('should transfer correct ETHmx amount', function () {
		it('when new rewards < updated stake', async function () {
			const { contract, deployer, ethmx, testerSigner } = fixture;
			const rewardsAmount = stakeAmount.div(2);

			await addRewards(fixture, rewardsAmount);
			await stake(fixture, stakeAmount);
			await stake(fixture, stakeAmount, testerSigner);
			await contract.updateAccrual();

			await contract.unstakeAll();

			const transferred = stakeAmount.sub(rewardsAmount.div(2));
			expect(
				await ethmx.balanceOf(contract.address),
				'contract ETHmx balance mismatch',
			).to.eq(stakeAmount.mul(2).sub(rewardsAmount).sub(transferred));

			expect(
				await ethmx.balanceOf(deployer),
				'deployer ETHmx balance mismatch',
			).to.eq(transferred);
		});

		it('when new rewards > updated stake', async function () {
			const { contract, deployer, ethmx, testerSigner } = fixture;
			const rewardsAmount = stakeAmount.mul(3);

			await addRewards(fixture, rewardsAmount);
			await stake(fixture, stakeAmount);
			await stake(fixture, stakeAmount, testerSigner);
			await contract.updateAccrual();

			await contract.unstakeAll();

			expect(
				await ethmx.balanceOf(contract.address),
				'contract ETHmx balance mismatch',
			).to.eq(0);

			expect(
				await ethmx.balanceOf(deployer),
				'deployer ETHmx balance mismatch',
			).to.eq(0);
		});
	});

	it('should emit Unstaked event', async function () {
		const { contract, deployer } = fixture;
		await stake(fixture, stakeAmount);
		await expect(contract.unstakeAll())
			.to.emit(contract, 'Unstaked')
			.withArgs(deployer, stakeAmount);
	});
}
