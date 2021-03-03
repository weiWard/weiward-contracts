import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';
import { MaxUint256 } from '@ethersproject/constants';

import { zeroAddress } from '../../../helpers/address';
import {
	Fixture,
	loadFixture,
	addRewards,
	stake,
	roundingFactor,
} from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('when totalStaked > new rewards', function () {
		const staked = parseEther('10');
		const rewards = parseEther('7');

		beforeEach(async function () {
			await stake(fixture, staked);
			await addRewards(fixture, rewards);
		});

		it('should update accruedRewardsPerToken', async function () {
			const { contract } = fixture;
			await contract.updateAccrual();
			const expected = rewards.mul(roundingFactor).div(staked);
			expect(await contract.accruedRewardsPerToken()).to.eq(expected);
		});

		it('should handle accruedRewardsPerToken overflow', async function () {
			const { contract } = fixture;
			await contract.setAccruedRewardsPerToken(MaxUint256);
			await contract.updateAccrual();
			const expected = rewards.mul(roundingFactor).div(staked).sub(1);
			expect(await contract.accruedRewardsPerToken()).to.eq(expected);
		});

		it('should update totalStaked', async function () {
			const { contract } = fixture;
			await contract.updateAccrual();
			expect(await contract.totalStaked()).to.eq(staked.sub(rewards));
		});

		it('should burn ETHmx', async function () {
			const { contract, ethmx } = fixture;

			expect(
				await ethmx.balanceOf(contract.address),
				'balance mismatch before update',
			).to.eq(staked);

			await expect(contract.updateAccrual(), 'event mismatch')
				.to.emit(ethmx, 'Transfer')
				.withArgs(contract.address, zeroAddress, rewards);

			expect(
				await ethmx.balanceOf(contract.address),
				'balance mismatch after update',
			).to.eq(staked.sub(rewards));
		});
	});

	describe('when totalStaked <= new rewards', function () {
		const staked = parseEther('10');
		const rewards = parseEther('25');
		const excess = rewards.sub(staked);

		beforeEach(async function () {
			await stake(fixture, staked);
			await addRewards(fixture, rewards);
		});

		it('should update unredeemable', async function () {
			const { contract } = fixture;
			await contract.updateAccrual();
			expect(await contract.unredeemableRewards()).to.eq(excess);
		});

		describe('and totalStaked != 0', function () {
			it('should update accruedRewardsPerToken', async function () {
				const { contract } = fixture;
				await contract.updateAccrual();
				expect(await contract.accruedRewardsPerToken()).to.eq(roundingFactor);
			});

			it('should handle accruedRewardsPerToken overflow', async function () {
				const { contract } = fixture;
				await contract.setAccruedRewardsPerToken(MaxUint256);
				await contract.updateAccrual();
				expect(await contract.accruedRewardsPerToken()).to.eq(
					roundingFactor.sub(1),
				);
			});

			it('should update totalStaked', async function () {
				const { contract } = fixture;
				await contract.updateAccrual();
				expect(await contract.totalStaked()).to.eq(0);
			});

			it('should burn ETHmx', async function () {
				const { contract, ethmx } = fixture;

				expect(
					await ethmx.balanceOf(contract.address),
					'balance mismatch before update',
				).to.eq(staked);

				await expect(contract.updateAccrual(), 'event mismatch')
					.to.emit(ethmx, 'Transfer')
					.withArgs(contract.address, zeroAddress, staked);

				expect(
					await ethmx.balanceOf(contract.address),
					'balance mismatch after update',
				).to.eq(0);
			});
		});

		describe('and totalStaked == 0', function () {
			it('should not update accruedRewardsPerToken', async function () {
				const { contract } = fixture;
				await contract.unstakeAll();
				await contract.updateAccrual();
				expect(await contract.accruedRewardsPerToken()).to.eq(0);
			});
		});
	});

	it('should update lastTotalRewardsAccrued', async function () {
		const { contract } = fixture;
		const rewards = parseEther('5');
		await addRewards(fixture, rewards);
		await contract.updateAccrual();
		expect(await contract.lastTotalRewardsAccrued()).to.eq(rewards);
	});

	it('should handle totalRewardsAccrued overflow', async function () {
		const { contract } = fixture;
		const staked = parseEther('10');
		const rewards = parseEther('7');

		await stake(fixture, staked);
		await addRewards(fixture, rewards.sub(1));

		await contract.setLastTotalRewardsAccrued(MaxUint256);
		await contract.updateAccrual();

		const expected = rewards.mul(roundingFactor).div(staked);
		expect(await contract.accruedRewardsPerToken()).to.eq(expected);
	});
}
