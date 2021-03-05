import { expect } from 'chai';
import { deployments } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';
import { parseEther } from 'ethers/lib/utils';
import { BigNumber } from '@ethersproject/bignumber';

import { zeroAddress, zeroPadAddress } from '../helpers/address';
import {
	MockERC20TxFee,
	MockERC20TxFee__factory,
	MockFeeLogic,
	MockFeeLogic__factory,
} from '../../build/types/ethers-v5';

const contractName = 'ERC20TxFee';
const symbol = 'TEST';

const feeRecipient = zeroPadAddress('0x1');
const feeNumerator = 75;
const feeDenominator = 1000;

function calcFee(amount: BigNumber): BigNumber {
	return amount.mul(feeNumerator).div(feeDenominator);
}

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: MockERC20TxFee;
	testerContract: MockERC20TxFee;
	feeLogic: MockFeeLogic;
}

const loadFixture = deployments.createFixture(
	async ({ getNamedAccounts, waffle }) => {
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const feeLogic = await new MockFeeLogic__factory(deployerSigner).deploy(
			feeRecipient,
			feeNumerator,
			feeDenominator,
		);

		const contract = await new MockERC20TxFee__factory(deployerSigner).deploy(
			contractName,
			symbol,
			18,
			feeLogic.address,
		);
		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			testerContract,
			feeLogic,
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
			const { contract, feeLogic } = fixture;

			expect(await contract.name(), 'name mismatch').to.eq(contractName);
			expect(await contract.symbol(), 'symbol mismatch').to.eq(symbol);
			expect(await contract.decimals(), 'decimals mismatch').to.eq(18);
			expect(await contract.feeLogic(), 'feeLogic address mismatch').to.eq(
				feeLogic.address,
			);
		});

		it('should revert when feeLogic is zero address', async function () {
			const { deployerSigner } = fixture;
			await expect(
				new MockERC20TxFee__factory(deployerSigner).deploy(
					'Test',
					'TEST2',
					18,
					zeroAddress,
				),
			).to.be.revertedWith('feeLogic zero address');
		});
	});

	describe('transfer', function () {
		const amount = parseEther('100');
		const fee = calcFee(amount);

		beforeEach(async function () {
			const { contract, deployer } = fixture;
			await contract.mint(deployer, amount);
		});

		it('should transfer with fee', async function () {
			const { contract, tester } = fixture;

			await contract.transfer(tester, amount);

			expect(
				await contract.balanceOf(feeRecipient),
				'fee recipient balance mismatch',
			).to.eq(fee);

			expect(
				await contract.balanceOf(tester),
				'target balance mismatch',
			).to.eq(amount.sub(fee));
		});

		it('should transfer full amount without fee', async function () {
			const { contract, feeLogic, tester } = fixture;
			await feeLogic.setFeeRate(0, 1);
			await contract.transfer(tester, amount);
			expect(await contract.balanceOf(tester)).to.eq(amount);
		});

		it('should apply beforeTokenTransfer hook', async function () {
			const { contract, tester } = fixture;
			await expect(contract.transfer(tester, amount)).to.emit(
				contract,
				'BeforeTokenTransfer',
			);
		});

		it('should emit regular Transfer event', async function () {
			const { contract, deployer, tester } = fixture;
			await expect(contract.transfer(tester, amount))
				.to.emit(contract, 'Transfer')
				.withArgs(deployer, tester, amount.sub(fee));
		});

		it('should emit fee Transfer event', async function () {
			const { contract, deployer, tester } = fixture;
			await expect(contract.transfer(tester, amount))
				.to.emit(contract, 'Transfer')
				.withArgs(deployer, feeRecipient, fee);
		});

		it('should notify feeLogic contract', async function () {
			const { contract, tester, feeLogic } = fixture;
			await expect(contract.transfer(tester, amount))
				.to.emit(feeLogic, 'Notified')
				.withArgs(fee);
		});

		it('should revert on transfer to zero address', async function () {
			const { contract } = fixture;
			await expect(contract.transfer(zeroAddress, amount)).to.be.revertedWith(
				'transfer to the zero address',
			);
		});
	});

	describe('transferFrom', function () {
		const amount = parseEther('100');
		const fee = calcFee(amount);

		beforeEach(async function () {
			const { contract, deployer } = fixture;
			await contract.mint(deployer, amount);
		});

		it('should transfer with fee', async function () {
			const { contract, deployer, tester } = fixture;

			await contract.increaseAllowance(deployer, amount);
			await contract.transferFrom(deployer, tester, amount);

			expect(
				await contract.balanceOf(feeRecipient),
				'fee recipient balance mismatch',
			).to.eq(fee);

			expect(
				await contract.balanceOf(tester),
				'target balance mismatch',
			).to.eq(amount.sub(fee));
		});

		it('should revert on transferFrom zero address', async function () {
			const { contract, tester } = fixture;
			await expect(
				contract.transferFrom(zeroAddress, tester, amount),
			).to.be.revertedWith('transfer from the zero address');
		});
	});
});
