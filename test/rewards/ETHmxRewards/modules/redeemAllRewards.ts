import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';
import { MaxUint256 } from '@ethersproject/constants';

import { ethUsedOnGas, parseETHmx } from '../../../helpers/conversions';
import { Fixture, loadFixture, addRewards, stake } from '../common';

export default function run(): void {
	let fixture: Fixture;
	const rewardsAmount = parseEther('10');
	const earnedRewards = rewardsAmount.div(2);
	const stakeAmount = parseETHmx('5');

	beforeEach(async function () {
		fixture = await loadFixture();
		const { contract, deployer, tester, testerSigner, weth } = fixture;

		await stake(fixture, stakeAmount);
		await stake(fixture, stakeAmount, testerSigner);

		await addRewards(fixture, rewardsAmount);
		await contract.updateAccrual();

		expect(
			await weth.balanceOf(contract.address),
			'contract rewards balance mismatch',
		).to.eq(rewardsAmount);

		expect(
			await contract.lastRewardsBalanceOf(deployer),
			'deployer lastRewardsBalanceOf mismatch before redemption',
		).to.eq(0);
		expect(
			await contract.rewardsBalanceOf(deployer),
			'deployer rewardsBalanceOf mismatch before redemption',
		).to.eq(earnedRewards);

		expect(
			await contract.lastRewardsBalanceOf(tester),
			'tester lastRewardsBalanceOf mismatch before redemption',
		).to.eq(0);
		expect(
			await contract.rewardsBalanceOf(tester),
			'tester rewardsBalanceOf mismatch before redemption',
		).to.eq(earnedRewards);
	});

	it('should transfer all rewards', async function () {
		const { contract, deployer, weth } = fixture;
		await contract.redeemAllRewards(true);

		expect(
			await weth.balanceOf(contract.address),
			'contract rewards balance mismatch after redemption',
		).to.eq(rewardsAmount.sub(earnedRewards));

		expect(
			await weth.balanceOf(deployer),
			'deployer rewards balance mismatch after redemption',
		).to.eq(earnedRewards);
	});

	it('should transfer all rewards as ETH', async function () {
		const { contract, deployerSigner, weth } = fixture;

		const balanceBefore = await deployerSigner.getBalance();

		const tx = await contract.redeemAllRewards(false);

		const gasUsed = await ethUsedOnGas(tx);
		const balanceAfter = await deployerSigner.getBalance();

		expect(
			await weth.balanceOf(contract.address),
			'contract rewards balance mismatch after redemption',
		).to.eq(rewardsAmount.sub(earnedRewards));

		expect(
			balanceAfter.sub(balanceBefore),
			'deployer rewards balance mismatch after redemption',
		).to.eq(earnedRewards.sub(gasUsed));
	});

	describe('should update totalRewardsRedeemed', function () {
		it('correctly', async function () {
			const { contract } = fixture;
			await contract.redeemAllRewards(true);
			expect(await contract.totalRewardsRedeemed()).to.eq(earnedRewards);
		});

		it('with overflow', async function () {
			const { contract } = fixture;
			await contract.setTotalRewardsRedeemed(MaxUint256);
			await contract.redeemAllRewards(true);
			expect(await contract.totalRewardsRedeemed()).to.eq(
				earnedRewards.sub(1),
			);
		});
	});

	it('should keep totalRewardsAccrued constant', async function () {
		const { contract } = fixture;

		expect(
			await contract.totalRewardsAccrued(),
			'mismatch before redemption',
		).to.eq(rewardsAmount);

		await contract.redeemAllRewards(true);

		expect(
			await contract.totalRewardsAccrued(),
			'mismatch after redemption',
		).to.eq(rewardsAmount);
	});

	it('should zero rewardsBalanceOf', async function () {
		const { contract, deployer } = fixture;
		await contract.redeemAllRewards(true);
		expect(await contract.rewardsBalanceOf(deployer)).to.eq(0);
	});

	it('should not affect rewardsBalanceOf for others', async function () {
		const { contract, tester, testerContract } = fixture;
		await contract.redeemAllRewards(true);

		expect(
			await contract.lastRewardsBalanceOf(tester),
			'lastRewardsBalanceOf mismatch before update',
		).to.eq(0);
		expect(
			await contract.rewardsBalanceOf(tester),
			'rewardsBalanceOf mismatch before update',
		).to.eq(earnedRewards);

		await testerContract.updateReward();

		expect(
			await contract.lastRewardsBalanceOf(tester),
			'lastRewardsBalanceOf mismatch after update',
		).to.eq(earnedRewards);
		expect(
			await contract.rewardsBalanceOf(tester),
			'rewardsBalanceOf mismatch after update',
		).to.eq(earnedRewards);
	});

	it('should emit RewardPaid event', async function () {
		const { contract, deployer } = fixture;
		await expect(contract.redeemAllRewards(true))
			.to.emit(contract, 'RewardPaid')
			.withArgs(deployer, earnedRewards);
	});
}
