import { expect } from 'chai';
import { parseEther } from 'ethers/lib/utils';

import { Fixture, loadFixture, stake, addRewards } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('exit', function () {
		it('should unstake all', async function () {
			const { contract, deployer } = fixture;
			const staked = parseEther('10');
			await stake(fixture, staked);

			await expect(contract.exit(true))
				.to.emit(contract, 'Unstaked')
				.withArgs(deployer, staked);
		});

		it('should redeem all rewards', async function () {
			const { contract, deployer } = fixture;
			const staked = parseEther('10');
			const rewards = parseEther('5');

			await addRewards(fixture, rewards);
			await stake(fixture, staked);
			await contract.updateAccrual();

			await expect(contract.exit(true))
				.to.emit(contract, 'RewardPaid')
				.withArgs(deployer, rewards);
		});
	});
}
