import { expect } from 'chai';

import { Fixture, loadFixture } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('can only be called by owner', async function () {
		const { testerContract, uniswapPool } = fixture;

		await expect(
			testerContract.removeToken(uniswapPool.address),
		).to.be.revertedWith('caller is not the owner');
	});

	it('should revert on unsupported token', async function () {
		const { contract, testPool } = fixture;

		await expect(contract.removeToken(testPool.address)).to.be.revertedWith(
			'unsupported token',
		);
	});

	it('should remove token from list of supported tokens', async function () {
		const { contract, uniswapPool } = fixture;

		await contract.removeToken(uniswapPool.address);

		expect(
			await contract.numStakingTokens(),
			'numStakingTokens mismatch after removal',
		).to.eq(2);

		await expect(
			contract.stakingTokenAt(2),
			'stakingTokenAt did not revert after removal',
		).to.be.revertedWith('index out of bounds');

		expect(
			await contract.supportsStakingToken(uniswapPool.address),
			'supportsStakingToken mismatch after removal',
		).to.be.false;
	});

	it('should emit TokenRemoved event', async function () {
		const { contract, deployer, uniswapPool } = fixture;

		await expect(contract.removeToken(uniswapPool.address))
			.to.emit(contract, 'TokenRemoved')
			.withArgs(deployer, uniswapPool.address);
	});
}
