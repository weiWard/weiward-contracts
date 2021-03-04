import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';
import { MaxUint256 } from '@ethersproject/constants';

import { parseETHmx } from '../../../helpers/conversions';
import { Fixture, loadFixture, addRewards, stake } from '../common';

export default function run(): void {
	let fixture: Fixture;
	const rewardsAmount = parseEther('10');
	const earnedRewards = rewardsAmount.div(2);
	const redeemed = earnedRewards.div(2);
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

		// await contract.updateReward();
		// await testerContract.updateReward();

		expect(
			await contract.rewardsBalanceOf(deployer),
			'deployer rewardsBalanceOf mismatch before redemption',
		).to.eq(0);
		expect(
			await contract.rewardsBalanceOf(tester),
			'tester rewardsBalanceOf mismatch before redemption',
		).to.eq(0);
	});

	it('should transfer correct reward', async function () {
		const { contract, deployer, weth } = fixture;
		await contract.redeemReward(redeemed);

		expect(
			await weth.balanceOf(contract.address),
			'contract rewards balance mismatch after redemption',
		).to.eq(rewardsAmount.sub(redeemed));

		expect(
			await weth.balanceOf(deployer),
			'deployer rewards balance mismatch after redemption',
		).to.eq(redeemed);
	});

	describe('should update totalRewardsRedeemed', function () {
		it('correctly', async function () {
			const { contract } = fixture;
			await contract.redeemReward(redeemed);
			expect(await contract.totalRewardsRedeemed()).to.eq(redeemed);
		});

		it('with overflow', async function () {
			const { contract } = fixture;
			await contract.setTotalRewardsRedeemed(MaxUint256);
			await contract.redeemReward(redeemed);
			expect(await contract.totalRewardsRedeemed()).to.eq(redeemed.sub(1));
		});
	});

	it('should keep totalRewardsAccrued constant', async function () {
		const { contract } = fixture;

		expect(
			await contract.totalRewardsAccrued(),
			'mismatch before redemption',
		).to.eq(rewardsAmount);

		await contract.redeemReward(redeemed);

		expect(
			await contract.totalRewardsAccrued(),
			'mismatch after redemption',
		).to.eq(rewardsAmount);
	});

	it('should set rewardsBalanceOf correctly', async function () {
		const { contract, deployer } = fixture;
		await contract.redeemReward(redeemed);
		expect(await contract.rewardsBalanceOf(deployer)).to.eq(
			earnedRewards.sub(redeemed),
		);
	});

	it('should not affect rewardsBalanceOf for others', async function () {
		const { contract, tester, testerContract } = fixture;
		await contract.redeemReward(redeemed);

		expect(
			await contract.rewardsBalanceOf(tester),
			'mismatch before update',
		).to.eq(0);

		await testerContract.updateReward();

		expect(
			await contract.rewardsBalanceOf(tester),
			'mismatch after update',
		).to.eq(earnedRewards);
	});

	it('should emit RewardPaid event', async function () {
		const { contract, deployer } = fixture;
		await expect(contract.redeemReward(redeemed))
			.to.emit(contract, 'RewardPaid')
			.withArgs(deployer, redeemed);
	});

	it('should revert when amount > reward', async function () {
		const { contract } = fixture;
		await expect(
			contract.redeemReward(earnedRewards.add(1)),
		).to.be.revertedWith('cannot redeem more rewards than earned');
	});
}
