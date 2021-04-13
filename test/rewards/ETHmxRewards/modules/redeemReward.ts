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
		const { contract, testerSigner } = fixture;

		await stake(fixture, stakeAmount);
		await stake(fixture, stakeAmount, testerSigner);

		await addRewards(fixture, rewardsAmount);
		await contract.updateAccrual();
	});

	it('initial rewards should be correct', async function () {
		const { contract, deployer, tester, weth } = fixture;

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
		await expect(contract.redeemReward(redeemed))
			.to.emit(contract, 'RewardPaid')
			.withArgs(deployer, redeemed);
	});

	it('should revert when amount == 0', async function () {
		const { contract } = fixture;
		await expect(contract.redeemReward(0)).to.be.revertedWith(
			'cannot redeem zero',
		);
	});

	it('should revert when amount > reward', async function () {
		const { contract } = fixture;
		await expect(
			contract.redeemReward(earnedRewards.add(1)),
		).to.be.revertedWith('cannot redeem more rewards than earned');
	});
}
