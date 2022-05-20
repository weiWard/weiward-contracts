import { expect } from 'chai';

import { parseETHtx } from '../../../helpers/conversions';
import { Fixture, loadFixture } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('should succeed', function () {
		const amount = parseETHtx('100');

		beforeEach(async function () {
			const { contract, ethtx } = fixture;
			await ethtx.mockMint(contract.address, amount);
		});

		it('and recover an ERC20', async function () {
			const { contract, tester, ethtx, feeLogic } = fixture;
			await contract.recoverUnsupportedERC20(ethtx.address, tester, amount);

			const fee = await feeLogic.getFee(contract.address, tester, amount);
			expect(await ethtx.balanceOf(tester)).to.eq(amount.sub(fee));
		});

		it('and emit Recovered event', async function () {
			const { contract, deployer, tester, ethtx } = fixture;
			await expect(
				contract.recoverUnsupportedERC20(ethtx.address, tester, amount),
			)
				.to.emit(contract, 'RecoveredUnsupported')
				.withArgs(deployer, ethtx.address, tester, amount);
		});
	});

	it('should fail to recover nonexistent token', async function () {
		const { contract, deployer, ethtx } = fixture;
		await expect(
			contract.recoverUnsupportedERC20(ethtx.address, deployer, 1),
		).to.be.revertedWith('amount exceeds balance');
	});

	it('should revert with ETHmx', async function () {
		const { contract, deployer, ethmx } = fixture;
		await expect(
			contract.recoverUnsupportedERC20(ethmx.address, deployer, 1),
		).to.be.revertedWith('cannot recover ETHmx');
	});

	it('should revert with WETH', async function () {
		const { contract, deployer, weth } = fixture;
		await expect(
			contract.recoverUnsupportedERC20(weth.address, deployer, 1),
		).to.be.revertedWith('cannot recover WETH');
	});

	it('can only be called by owner', async function () {
		const { testerContract, tester, ethtx } = fixture;
		await expect(
			testerContract.recoverUnsupportedERC20(ethtx.address, tester, 1),
		).to.be.revertedWith('caller is not the owner');
	});
}
