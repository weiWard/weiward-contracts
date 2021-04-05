import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseEther } from 'ethers/lib/utils';
import { BigNumber } from '@ethersproject/bignumber';
import { JsonRpcSigner } from '@ethersproject/providers';

import { zeroAddress, zeroPadAddress } from '../helpers/address';
import {
	MockFeeLogic,
	MockFeeLogic__factory,
} from '../../build/types/ethers-v5';

const contractName = 'FeeLogic';
const feeRecipient = zeroPadAddress('0x1');
const feeNumerator = 75;
const feeDenominator = 1000;

function calcFee(amount: BigNumber): BigNumber {
	return amount.mul(feeNumerator).div(feeDenominator);
}

function undoFee(amount: BigNumber): BigNumber {
	return amount.mul(feeDenominator).div(feeDenominator - feeNumerator);
}

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: MockFeeLogic;
	testerContract: MockFeeLogic;
}

const loadFixture = deployments.createFixture(
	async ({ getNamedAccounts, waffle }) => {
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const contract = await new MockFeeLogic__factory(deployerSigner).deploy(
			deployer,
			feeRecipient,
			feeNumerator,
			feeDenominator,
		);
		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			testerContract,
		};
	},
);

describe(contractName, function () {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('constructor', function () {
		it('initial state is correct', async function () {
			const { contract, deployer } = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);

			expect(await contract.recipient(), 'fee recipient mismatch').to.eq(
				feeRecipient,
			);

			const [feeRateNum, feeRateDen] = await contract.feeRate();
			expect(feeRateNum, 'feeRate numerator mismatch').to.eq(feeNumerator);
			expect(feeRateDen, 'feeRate denominator mismatch').to.eq(feeDenominator);

			expect(await contract.exemptsLength(), 'exemptsLength mismatch').to.eq(
				0,
			);
		});
	});

	describe('exemptsAt', function () {
		it('should return an exempt address', async function () {
			const { contract, tester } = fixture;
			await contract.setExempt(tester, true);
			expect(await contract.exemptsAt(0)).to.eq(tester);
		});
	});

	describe('getFee', function () {
		it('should be correct', async function () {
			const { contract, deployer, tester } = fixture;
			const amount = parseEther('10');
			const fee = calcFee(amount);
			expect(await contract.getFee(deployer, tester, amount)).to.eq(fee);
		});

		it('should return zero for exemption', async function () {
			const { contract, deployer, tester } = fixture;
			await contract.setExempt(deployer, true);
			const amount = parseEther('10');
			expect(await contract.getFee(deployer, tester, amount)).to.eq(0);
		});
	});

	describe('isExempt', function () {
		it('should return false for non-exempt', async function () {
			const { contract, deployer } = fixture;
			expect(await contract.isExempt(deployer)).to.be.false;
		});

		it('should return true for exemption', async function () {
			const { contract, deployer } = fixture;
			await contract.setExempt(deployer, true);
			expect(await contract.isExempt(deployer)).to.be.true;
		});
	});

	describe('undoFee', function () {
		it('should be correct', async function () {
			const { contract, deployer, tester } = fixture;
			const amount = parseEther('10');
			const amountBeforeFee = undoFee(amount);
			expect(await contract.undoFee(deployer, tester, amount)).to.eq(
				amountBeforeFee,
			);
		});

		it('should return input amount for exemption', async function () {
			const { contract, deployer, tester } = fixture;
			await contract.setExempt(deployer, true);
			const amount = parseEther('10');
			expect(await contract.undoFee(deployer, tester, amount)).to.eq(amount);
		});
	});

	describe('setExempt', function () {
		it('can only be called by owner', async function () {
			const { testerContract, tester } = fixture;
			await expect(testerContract.setExempt(tester, true)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		describe('adding an exemption', function () {
			it('should update exemptsLength', async function () {
				const { contract, tester } = fixture;
				await contract.setExempt(tester, true);
				expect(await contract.exemptsLength()).to.eq(1);
			});

			it('should make account exempt', async function () {
				const { contract, tester } = fixture;
				await contract.setExempt(tester, true);
				expect(await contract.isExempt(tester)).to.be.true;
			});

			it('should emit ExemptAdded event', async function () {
				const { contract, deployer, tester } = fixture;
				await expect(contract.setExempt(tester, true))
					.to.emit(contract, 'ExemptAdded')
					.withArgs(deployer, tester);
			});

			it('should not emit event if already exempt', async function () {
				const { contract, tester } = fixture;
				await contract.setExempt(tester, true);
				await expect(contract.setExempt(tester, true)).to.not.emit(
					contract,
					'ExemptAdded',
				);
			});
		});

		describe('removing an exemption', function () {
			beforeEach(async function () {
				const { contract, tester } = fixture;
				await contract.setExempt(tester, true);
			});

			it('should update exemptsLength', async function () {
				const { contract, tester } = fixture;
				await contract.setExempt(tester, false);
				expect(await contract.exemptsLength()).to.eq(0);
			});

			it('should make account non-exempt', async function () {
				const { contract, tester } = fixture;
				await contract.setExempt(tester, false);
				expect(await contract.isExempt(tester)).to.be.false;
			});

			it('should emit ExemptRemoved event', async function () {
				const { contract, deployer, tester } = fixture;
				await expect(contract.setExempt(tester, false))
					.to.emit(contract, 'ExemptRemoved')
					.withArgs(deployer, tester);
			});

			it('should not emit event if already not exempt', async function () {
				const { contract, tester } = fixture;
				await contract.setExempt(tester, false);
				await expect(contract.setExempt(tester, false)).to.not.emit(
					contract,
					'ExemptRemoved',
				);
			});
		});
	});

	describe('setFeeRate', function () {
		const newFeeNum = 50;
		const newFeeDen = 500;

		before(function () {
			expect(newFeeNum, 'fee numerator will not change').to.not.eq(
				feeNumerator,
			);
			expect(newFeeDen, 'fee denominator will not change').to.not.eq(
				feeDenominator,
			);
		});

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(
				testerContract.setFeeRate(newFeeNum, newFeeDen),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should revert when numerator == denominator', async function () {
			const { contract } = fixture;
			await expect(contract.setFeeRate(0, 0)).to.be.revertedWith(
				'feeRate is gte to 1',
			);
		});

		it('should revert when numerator > denominator', async function () {
			const { contract } = fixture;
			await expect(contract.setFeeRate(1, 0)).to.be.revertedWith(
				'feeRate is gte to 1',
			);
		});

		it('should update feeRate', async function () {
			const { contract } = fixture;
			await contract.setFeeRate(newFeeNum, newFeeDen);
			const [feeNum, feeDen] = await contract.feeRate();
			expect(feeNum, 'fee numerator mismatch').to.eq(newFeeNum);
			expect(feeDen, 'fee denominator mismatch').to.eq(newFeeDen);
		});

		it('should emit FeeRateSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setFeeRate(newFeeNum, newFeeDen))
				.to.emit(contract, 'FeeRateSet')
				.withArgs(deployer, newFeeNum, newFeeDen);
		});
	});

	describe('setRecipient', function () {
		const newRecipient = zeroPadAddress('0x2');

		before(function () {
			expect(newRecipient, 'recipient will not change').to.not.eq(
				feeRecipient,
			);
		});

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(
				testerContract.setRecipient(newRecipient),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should revert when recipient is zero address', async function () {
			const { contract } = fixture;
			await expect(contract.setRecipient(zeroAddress)).to.be.revertedWith(
				'recipient is zero address',
			);
		});

		it('should update recipient', async function () {
			const { contract } = fixture;
			await contract.setRecipient(newRecipient);
			expect(await contract.recipient()).to.eq(newRecipient);
		});

		it('should emit RecipientSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setRecipient(newRecipient))
				.to.emit(contract, 'RecipientSet')
				.withArgs(deployer, newRecipient);
		});
	});
});
