import { deployments } from 'hardhat';
import { expect } from 'chai';
import { hexZeroPad } from '@ethersproject/bytes';
import { JsonRpcSigner } from '@ethersproject/providers';
import { solidityKeccak256 } from 'ethers/lib/utils';

import { zeroPadAddress } from '../helpers/address';
import { parseETHtx, parseGwei } from '../helpers/conversions';
import {
	MockETHtx,
	MockETHtx__factory,
	MockFeeLogic,
	MockFeeLogic__factory,
	MockGasPrice,
	MockGasPrice__factory,
	Policy,
	Policy__factory,
} from '../../build/types/ethers-v5';

const contractName = 'Policy';

const defaultGasPrice = parseGwei('200');
const oracleUpdateInterval = 3600;

const feeRecipient = zeroPadAddress('0x1');
const feeNumerator = 25;
const feeDenominator = 1000;
const rebaseFeeNum = 1;
const rebaseFeeDen = 100;

const oracleRole = solidityKeccak256(['string'], ['ORACLE_ROLE']);
const policyRole = solidityKeccak256(['string'], ['POLICY_ROLE']);
const adminRole = hexZeroPad('0x0', 32);

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: Policy;
	testerContract: Policy;
	ethtx: MockETHtx;
	feeLogic: MockFeeLogic;
	gasOracle: MockGasPrice;
}

const loadFixture = deployments.createFixture(
	async ({ getNamedAccounts, waffle }) => {
		// Get accounts
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const gasOracle = await new MockGasPrice__factory(deployerSigner).deploy(
			deployer,
			oracleUpdateInterval,
			defaultGasPrice,
		);

		const feeLogic = await new MockFeeLogic__factory(deployerSigner).deploy({
			owner: deployer,
			recipient: feeRecipient,
			feeRateNumerator: feeNumerator,
			feeRateDenominator: feeDenominator,
			exemptions: [],
			rebaseInterval: 0,
			rebaseFeeRateNum: rebaseFeeNum,
			rebaseFeeRateDen: rebaseFeeDen,
			rebaseExemptions: [],
		});

		const ethtx = await new MockETHtx__factory(deployerSigner).deploy(
			deployer,
		);

		// Deploy contract
		const contract = await new Policy__factory(deployerSigner).deploy(
			deployer,
			deployer,
			gasOracle.address,
			ethtx.address,
		);
		const testerContract = contract.connect(testerSigner);

		await gasOracle.grantRole(oracleRole, contract.address);
		await ethtx.postInit({
			feeLogic: feeLogic.address,
			minters: [deployer],
			rebasers: [contract.address],
		});

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			testerContract,
			ethtx,
			feeLogic,
			gasOracle,
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
			const { contract, deployer, ethtx, gasOracle } = fixture;

			expect(
				await contract.hasRole(adminRole, deployer),
				'missing admin role',
			).to.be.true;

			expect(
				await contract.hasRole(policyRole, deployer),
				'missing policy role',
			).to.be.true;

			expect(await contract.ethtx(), 'ETHtx address mismatch').to.eq(
				ethtx.address,
			);
			expect(await contract.gasOracle(), 'GasPrice address mismatch').to.eq(
				gasOracle.address,
			);
		});
	});

	describe('update', function () {
		it('can only be called by policy role', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.update(1)).to.be.revertedWith(
				'access denied',
			);
		});

		it('should emit GasPriceUpdate', async function () {
			const { contract, gasOracle } = fixture;
			const newPrice = parseGwei('20');
			await expect(contract.update(newPrice))
				.to.emit(gasOracle, 'GasPriceUpdate')
				.withArgs(contract.address, newPrice);
		});

		it('should emit Rebased', async function () {
			const { contract, deployer, ethtx } = fixture;

			// Cause rebase to do something
			const initShares = parseETHtx('10');
			await ethtx.mint(deployer, initShares);

			const newShares = initShares
				.mul(rebaseFeeDen)
				.div(rebaseFeeDen - rebaseFeeNum);
			const newPrice = parseGwei('20');
			await expect(contract.update(newPrice))
				.to.emit(ethtx, 'Rebased')
				.withArgs(contract.address, newShares);
		});
	});
});
