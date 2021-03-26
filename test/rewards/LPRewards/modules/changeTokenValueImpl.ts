import { expect } from 'chai';

import { Fixture, loadFixture } from '../common';
import { zeroAddress } from '../../../helpers/address';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('cant only be called by owner', async function () {
		const { testerContract, uniswapPool, valuePerTest } = fixture;

		await expect(
			testerContract.changeTokenValueImpl(
				uniswapPool.address,
				valuePerTest.address,
			),
		).to.be.revertedWith('caller is not the owner');
	});

	it('should revert when token is not supported', async function () {
		const { contract, testPool, valuePerTest } = fixture;

		await expect(
			contract.changeTokenValueImpl(testPool.address, valuePerTest.address),
		).to.be.revertedWith('unsupported token');
	});

	it('should revert when tokenValueImpl is zero address', async function () {
		const { contract, uniswapPool } = fixture;

		await expect(
			contract.changeTokenValueImpl(uniswapPool.address, zeroAddress),
		).to.be.revertedWith('tokenValueImpl cannot be zero address');
	});

	it('should set tokenValueImpl for token', async function () {
		const { contract, uniswapPool, valuePerTest } = fixture;

		await contract.changeTokenValueImpl(
			uniswapPool.address,
			valuePerTest.address,
		);

		expect(await contract.valuePerTokenImpl(uniswapPool.address)).to.eq(
			valuePerTest.address,
		);
	});

	it('should emit TokenValueImplChanged event', async function () {
		const { contract, deployer, uniswapPool, valuePerTest } = fixture;

		await expect(
			contract.changeTokenValueImpl(uniswapPool.address, valuePerTest.address),
		)
			.to.emit(contract, 'TokenValueImplChanged')
			.withArgs(deployer, uniswapPool.address, valuePerTest.address);
	});
}
