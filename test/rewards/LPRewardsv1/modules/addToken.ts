import { expect } from 'chai';

import { Fixture, loadFixture } from '../common';
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

	it('should revert with already supported token', async function () {
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

		expect(
			await contract.supportsStakingToken(testPool.address),
			'supportsStakingToken mismatch before addition',
		).to.be.false;

		await contract.addToken(testPool.address, valuePerTest.address);

		expect(
			await contract.numStakingTokens(),
			'numStakingTokens mismatch after addition',
		).to.eq(4);

		expect(await contract.stakingTokenAt(3), 'stakingTokenAt mismatch').to.eq(
			testPool.address,
		);

		expect(
			await contract.supportsStakingToken(testPool.address),
			'supportsStakingToken mismatch after addition',
		).to.be.true;
	});

	it('should set tokenValueImpl', async function () {
		const { contract, testPool, valuePerTest } = fixture;
		await contract.addToken(testPool.address, valuePerTest.address);

		expect(await contract.valuePerTokenImpl(testPool.address)).to.eq(
			valuePerTest.address,
		);
	});

	it('should emit TokenAdded event', async function () {
		const { contract, deployer, testPool, valuePerTest } = fixture;

		await expect(contract.addToken(testPool.address, valuePerTest.address))
			.to.emit(contract, 'TokenAdded')
			.withArgs(deployer, testPool.address, valuePerTest.address);
	});
}
