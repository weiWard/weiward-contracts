import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';

import { parseETHmx } from '../../../helpers/conversions';
import {
	Fixture,
	loadFixture,
	addRewards,
	stake,
	ethmxToEth,
} from '../common';

export default function run(): void {
	let fixture: Fixture;
	const stakeAmount = parseETHmx('5');

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
			'rewardsBalanceOf mismatch before stake',
		).to.eq(0);

		await stake(fixture, stakeAmount);

		let expected = rewardsAmount.div(2);
		if (expected.gt(stakeAmount)) {
			expected = stakeAmount;
		}
		expect(
			await contract.rewardsBalanceOf(deployer),
			'rewardsBalanceOf mismatch after stake',
		).to.eq(expected);
	});

	it('should transfer ETHmx from sender', async function () {
		const { contract, deployer, ethmx } = fixture;

		await stake(fixture, stakeAmount);

		expect(
			await ethmx.balanceOf(deployer),
			'deployer ETHmx balance mismatch',
		).to.eq(0);

		expect(
			await ethmx.balanceOf(contract.address),
			'contract ETHmx balance mismatch',
		).to.eq(stakeAmount);
	});

	it('should update stakedBalanceOf', async function () {
		const { contract, deployer } = fixture;
		await stake(fixture, stakeAmount);
		expect(await contract.stakedBalanceOf(deployer)).to.eq(stakeAmount);
	});

	it('should update totalStaked', async function () {
		const { contract } = fixture;
		await stake(fixture, stakeAmount);
		expect(await contract.totalStaked()).to.eq(stakeAmount);
	});

	it('should emit Staked event', async function () {
		const { contract, deployer, ethmx } = fixture;

		await ethmx.mint({ value: ethmxToEth(stakeAmount) });
		await ethmx.increaseAllowance(contract.address, stakeAmount);

		await expect(contract.stake(stakeAmount))
			.to.emit(contract, 'Staked')
			.withArgs(deployer, stakeAmount);
	});

	it('should revert when paused', async function () {
		const { contract } = fixture;
		await contract.pause();
		await expect(contract.stake(stakeAmount)).to.be.revertedWith('paused');
	});

	it('should revert when amount is zero', async function () {
		const { contract } = fixture;
		await expect(contract.stake(0)).to.be.revertedWith('cannot stake zero');
	});

	it('should revert when amount > balance', async function () {
		const { contract } = fixture;
		await expect(contract.stake(1)).to.be.revertedWith(
			'transfer amount exceeds balance',
		);
	});
}
