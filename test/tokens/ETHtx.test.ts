import { expect } from 'chai';
import { deployments } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';

import { zeroAddress, zeroPadAddress } from '../helpers/address';
import { parseETHtx } from '../helpers/conversions';
import {
	MockETHtx,
	MockETHtx__factory,
	FeeLogic__factory,
	FeeLogic,
} from '../../build/types/ethers-v5';

const contractName = 'ETHtx';

const feeRecipient = zeroPadAddress('0x1');
const feeNumerator = 75;
const feeDenominator = 1000;

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: MockETHtx;
	testerContract: MockETHtx;
	feeLogic: FeeLogic;
}

const loadFixture = deployments.createFixture(
	async ({ getNamedAccounts, waffle }) => {
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const feeLogic = await new FeeLogic__factory(deployerSigner).deploy(
			feeRecipient,
			feeNumerator,
			feeDenominator,
		);

		const contract = await new MockETHtx__factory(deployerSigner).deploy(
			feeLogic.address,
			deployer,
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
			const { contract, deployer, feeLogic } = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);

			expect(await contract.feeLogic(), 'feeLogic address mismatch').to.eq(
				feeLogic.address,
			);

			expect(await contract.minter(), 'minter address mismatch').to.eq(
				deployer,
			);
		});
	});

	describe('burn', function () {
		it('can only be called by minter', async function () {
			const { testerContract, deployer } = fixture;
			await expect(testerContract.burn(deployer, 1)).to.be.revertedWith(
				'caller is not the minter',
			);
		});

		it('should revert when paused', async function () {
			const { contract, deployer } = fixture;
			await contract.setMinter(deployer);
			await contract.pause();
			await expect(contract.burn(deployer, 1)).to.be.revertedWith('paused');
		});

		it('should burn tokens', async function () {
			const { contract, deployer, tester } = fixture;
			const amount = parseETHtx('100');
			await contract.setMinter(deployer);
			await contract.mint(tester, amount);

			await expect(contract.burn(tester, amount))
				.to.emit(contract, 'Transfer')
				.withArgs(tester, zeroAddress, amount);
		});
	});

	describe('mint', function () {
		it('can only be called by minter', async function () {
			const { testerContract, tester } = fixture;
			await expect(testerContract.mint(tester, 1)).to.be.revertedWith(
				'caller is not the minter',
			);
		});

		it('should revert when paused', async function () {
			const { contract, deployer } = fixture;
			await contract.pause();
			await expect(contract.mint(deployer, 1)).to.be.revertedWith('paused');
		});

		it('should mint tokens', async function () {
			const { contract, tester } = fixture;
			const amount = parseETHtx('100');

			await expect(contract.mint(tester, amount))
				.to.emit(contract, 'Transfer')
				.withArgs(zeroAddress, tester, amount);
		});
	});

	describe('pause', function () {
		it('should update paused', async function () {
			const { contract } = fixture;
			expect(await contract.paused(), 'mismatch before call').to.be.false;
			await contract.pause();
			expect(await contract.paused(), 'failed to update paused').to.be.true;
		});

		it('should revert when paused', async function () {
			const { contract } = fixture;
			await contract.pause();
			await expect(contract.pause()).to.be.revertedWith('paused');
		});

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.pause()).to.be.revertedWith(
				'caller is not the owner',
			);
		});
	});

	describe('setFeeLogic', function () {
		const newFeeLogic = zeroPadAddress('0x3');

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setFeeLogic(newFeeLogic)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should revert when set to zero address', async function () {
			const { contract } = fixture;
			await expect(contract.setFeeLogic(zeroAddress)).to.be.revertedWith(
				'feeLogic zero address',
			);
		});

		it('should set feeLogic address', async function () {
			const { contract } = fixture;
			await contract.setFeeLogic(newFeeLogic);
			expect(await contract.feeLogic()).to.eq(newFeeLogic);
		});

		it('should emit FeeLogicSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setFeeLogic(newFeeLogic))
				.to.emit(contract, 'FeeLogicSet')
				.withArgs(deployer, newFeeLogic);
		});
	});

	describe('setMinter', function () {
		const newMinter = zeroAddress;

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setMinter(newMinter)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should set minter address', async function () {
			const { contract } = fixture;
			await contract.setMinter(newMinter);
			expect(await contract.minter()).to.eq(newMinter);
		});

		it('should emit MinterSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setMinter(newMinter))
				.to.emit(contract, 'MinterSet')
				.withArgs(deployer, newMinter);
		});
	});

	describe('unpause', function () {
		it('should update paused', async function () {
			const { contract } = fixture;
			await contract.pause();
			expect(await contract.paused(), 'pause failed').to.be.true;
			await contract.unpause();
			expect(await contract.paused(), 'unpause failed').to.be.false;
		});

		it('should revert when unpaused', async function () {
			const { contract } = fixture;
			await expect(contract.unpause()).to.be.revertedWith('not paused');
		});

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.unpause()).to.be.revertedWith(
				'caller is not the owner',
			);
		});
	});
});
