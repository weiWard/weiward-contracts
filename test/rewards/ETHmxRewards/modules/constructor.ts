import { expect } from 'chai';

import { Fixture, loadFixture, accrualUpdateInterval } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('initial state is correct', async function () {
		const { deployer, contract, ethmx, ethtx, weth } = fixture;

		expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);

		expect(await contract.ethmxAddr(), 'ETHmx address mismatch').to.eq(
			ethmx.address,
		);
		expect(await contract.wethAddr(), 'WETH address mismatch').to.eq(
			weth.address,
		);
		expect(
			await contract.accrualUpdateInterval(),
			'accrualUpdateInterval mismatch',
		).to.eq(accrualUpdateInterval);

		expect(
			await contract.accruedRewardsPerToken(),
			'accruedRewardsPerToken mismatch',
		).to.eq(0);
		expect(
			await contract.accruedRewardsPerTokenLast(deployer),
			'accruedRewardsPerTokenLast mismatch',
		).to.eq(0);

		expect(
			await contract.lastAccrualUpdate(),
			'lastAccrualUpdate mismatch',
		).to.eq(0);

		expect(
			await contract.rewardsBalanceOf(deployer),
			'rewardsBalanceOf mismatch',
		).to.eq(0);
		expect(
			await contract.stakedBalanceOf(deployer),
			'stakedBalanceOf mismatch',
		).to.eq(0);

		expect(
			await contract.totalRewardsAccrued(),
			'totalRewardsAccrued mismatch',
		).to.eq(0);
		expect(
			await contract.totalRewardsRedeemed(),
			'totalRewardsRedeemed mismatch',
		).to.eq(0);

		expect(await contract.totalStaked(), 'totalStaked mismatch').to.eq(0);

		expect(
			await contract.unredeemableRewards(),
			'unredeemableRewards mismatch',
		).to.eq(0);

		expect(await ethmx.balanceOf(deployer), 'ETHmx balance mismatch').to.eq(0);
		expect(await weth.balanceOf(deployer), 'WETH balance mismatch').to.eq(0);
		expect(await ethtx.balanceOf(deployer), 'ETHtx balance mismatch').to.eq(0);
	});
}
