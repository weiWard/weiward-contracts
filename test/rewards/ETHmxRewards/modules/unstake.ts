import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';

import {
	Fixture,
	loadFixture,
	addRewards,
	stake,
	parseETHmx,
} from '../common';

export default function run(): void {
	let fixture: Fixture;
	const stakeAmount = parseETHmx('5');
	const unstaked = stakeAmount.div(2);

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should update rewardsBalanceOf', async function () {
		const { contract, deployer, testerSigner } = fixture;
		const rewardsAmount = parseEther('7');

		await addRewards(fixture, rewardsAmount);
		await stake(fixture, stakeAmount);
		await stake(fixture, stakeAmount, testerSigner);
		await contract.updateAccrual();

		expect(
			await contract.rewardsBalanceOf(deployer),
			'rewardsBalanceOf mismatch before unstake',
		).to.eq(0);

		await contract.unstake(unstaked);

		let expected = rewardsAmount.div(2);
		if (expected.gt(stakeAmount)) {
			expected = stakeAmount;
		}
		expect(
			await contract.rewardsBalanceOf(deployer),
			'rewardsBalanceOf mismatch after unstake',
		).to.eq(expected);
	});

	describe('should update stakedBalanceOf', function () {
		const rewardsAmount = unstaked;
		const updatedStake = stakeAmount.sub(rewardsAmount.div(2));

		beforeEach(async function () {
			const { contract, testerSigner } = fixture;

			await addRewards(fixture, rewardsAmount);
			await stake(fixture, stakeAmount);
			await stake(fixture, stakeAmount, testerSigner);
			await contract.updateAccrual();
		});

		it('when amount < updated stake', async function () {
			const { contract, deployer } = fixture;
			await contract.unstake(updatedStake.sub(1));
			expect(await contract.stakedBalanceOf(deployer)).to.eq(1);
		});

		it('when amount > updated stake', async function () {
			const { contract, deployer } = fixture;
			await contract.unstake(updatedStake.add(1));
			expect(await contract.stakedBalanceOf(deployer)).to.eq(0);
		});
	});

	it('should update totalStaked', async function () {
		const { contract } = fixture;
		await stake(fixture, stakeAmount);
		await contract.unstake(unstaked);
		expect(await contract.totalStaked()).to.eq(stakeAmount.sub(unstaked));
	});

	describe('should transfer correct ETHmx amount', function () {
		it('when new rewards < updated stake', async function () {
			const { contract, deployer, ethmx, testerSigner } = fixture;
			const rewardsAmount = unstaked;

			await addRewards(fixture, rewardsAmount);
			await stake(fixture, stakeAmount);
			await stake(fixture, stakeAmount, testerSigner);
			await contract.updateAccrual();

			await contract.unstake(unstaked);

			expect(
				await ethmx.balanceOf(contract.address),
				'contract ETHmx balance mismatch',
			).to.eq(stakeAmount.mul(2).sub(rewardsAmount).sub(unstaked));

			expect(
				await ethmx.balanceOf(deployer),
				'deployer ETHmx balance mismatch',
			).to.eq(unstaked);
		});

		it('when new rewards > updated stake', async function () {
			const { contract, deployer, ethmx, testerSigner } = fixture;
			const rewardsAmount = stakeAmount.mul(3);

			await addRewards(fixture, rewardsAmount);
			await stake(fixture, stakeAmount);
			await stake(fixture, stakeAmount, testerSigner);
			await contract.updateAccrual();

			await contract.unstake(unstaked);

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
		await expect(contract.unstake(unstaked))
			.to.emit(contract, 'Unstaked')
			.withArgs(deployer, unstaked);
	});

	it('should revert when amount is zero', async function () {
		const { contract } = fixture;
		await expect(contract.unstake(0)).to.be.revertedWith(
			'cannot unstake zero',
		);
	});

	it('should revert when amount > initial stakedBalanceOf', async function () {
		const { contract } = fixture;
		await expect(contract.unstake(1)).to.be.revertedWith(
			'cannot unstake more than staked balance',
		);
	});
}
