import { expect } from 'chai';

import { addRewards, Fixture, loadFixture, uniStake } from '../common';
import { zeroAddress } from '../../../helpers/address';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('can only be called by owner', async function () {
		const { testerContract, testPool, valuePerTest } = fixture;

		await expect(
			testerContract.addToken(testPool.address, valuePerTest.address),
		).to.be.revertedWith('caller is not the owner');
	});

	it('should revert when token already added', async function () {
		const { contract, uniswapPool, valuePerUNIV2 } = fixture;

		await expect(
			contract.addToken(uniswapPool.address, valuePerUNIV2.address),
		).to.be.revertedWith('token already added');
	});

	it('should revert when tokenValueImpl is zero address', async function () {
		const { contract, testPool } = fixture;

		await expect(
			contract.addToken(testPool.address, zeroAddress),
		).to.be.revertedWith('tokenValueImpl cannot be zero address');
	});

	it('should add token to list of supported tokens', async function () {
		const { contract, testPool, valuePerTest } = fixture;
		await contract.addToken(testPool.address, valuePerTest.address);

		expect(
			await contract.numStakingTokens(),
			'numStakingTokens mismatch',
		).to.eq(4);

		expect(await contract.stakingTokenAt(3), 'stakingTokenAt mismatch').to.eq(
			testPool.address,
		);
	});

	it('should set tokenValueImpl for added token', async function () {
		const { contract, testPool, valuePerTest } = fixture;
		await contract.addToken(testPool.address, valuePerTest.address);

		expect(await contract.valuePerTokenImplFor(testPool.address)).to.eq(
			valuePerTest.address,
		);
	});

	it('should emit TokenAdded event', async function () {
		const { contract, testPool, valuePerTest } = fixture;

		await expect(contract.addToken(testPool.address, valuePerTest.address))
			.to.emit(contract, 'TokenAdded')
			.withArgs(testPool.address, valuePerTest.address);
	});

	it('should update rewards for other tokens first', async function () {
		const { contract, uniswapPool, testPool, valuePerTest } = fixture;

		await uniStake(fixture);
		const rewards = await addRewards(fixture);

		await contract.addToken(testPool.address, valuePerTest.address);

		expect(
			await contract.totalRewardsAccruedFor(uniswapPool.address),
			'totalRewardsAccruedFor other token mismatch',
		).to.eq(rewards);

		expect(
			await contract.totalRewardsAccruedFor(testPool.address),
			'totalRewardsAccruedFor added token mismatch',
		).to.eq(0);
	});
}
