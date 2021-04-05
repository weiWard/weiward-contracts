import { deployments } from 'hardhat';
import { expect } from 'chai';
import FakeTimers from '@sinonjs/fake-timers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { utils } from 'ethers';

import { mineBlock } from '../helpers/timeTravel';
import {
	MockGasPrice,
	MockGasPrice__factory,
} from '../../build/types/ethers-v5';
import { MockProvider } from 'ethereum-waffle';

const initialGasPrice = 10000000;
const initialUpdateThreshold = 1800; // 1800s (30m)
const ORACLE_ROLE = utils.solidityKeccak256(['string'], ['ORACLE_ROLE']);
const DEFAULT_ADMIN_ROLE =
	'0x0000000000000000000000000000000000000000000000000000000000000000';

const loadFixture = deployments.createFixture(
	async ({ getNamedAccounts, waffle }) => {
		// Get accounts
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		// Deploy contract
		const contract = await new MockGasPrice__factory(deployerSigner).deploy(
			deployer,
			initialUpdateThreshold,
			initialGasPrice,
		);
		const testerContract = contract.connect(testerSigner);

		return {
			provider: waffle.provider,
			deployer,
			tester,
			contract,
			testerContract,
		};
	},
);

describe('GasPrice', function () {
	let deployer: string;
	let contract: MockGasPrice;
	let provider: MockProvider;
	let testerContract: MockGasPrice;

	beforeEach(async function () {
		({ contract, deployer, provider, testerContract } = await loadFixture());
		await contract.grantRole(ORACLE_ROLE, deployer);
	});

	it('initial state is correct', async function () {
		expect(await contract.gasPrice()).to.eq(initialGasPrice);
		expect(await contract.updateThreshold()).to.eq(initialUpdateThreshold);
		expect(await contract.hasRole(DEFAULT_ADMIN_ROLE, deployer)).to.eq(true);
		expect(await contract.hasRole(ORACLE_ROLE, deployer)).to.eq(true);
	});

	describe('setGasPrice', function () {
		const newPrice = 50000000;

		it('Sets gasPrice correctly', async function () {
			await contract.setGasPrice(newPrice);
			expect(await contract.gasPrice()).to.eq(newPrice);
		});

		it('Sets updatedAt correctly', async function () {
			const tx = await contract.setGasPrice(newPrice);
			const block = await provider.getBlock(tx.blockNumber || '');
			expect(await contract.updatedAt()).to.eq(block.timestamp);
		});

		it('emits GasPriceUpdate event', async function () {
			await expect(contract.setGasPrice(newPrice))
				.to.emit(contract, 'GasPriceUpdate')
				.withArgs(deployer, newPrice);
		});

		it('reverts when sender does not have the oracle role', async function () {
			await expect(testerContract.setGasPrice(newPrice)).to.be.revertedWith(
				'Caller is not a trusted oracle source.',
			);
		});
	});

	describe('setUpdateThreshold', function () {
		const newUpdateThreshold = 900;

		it('Sets updateThreshold correctly', async function () {
			await contract.setUpdateThreshold(newUpdateThreshold);
			expect(await contract.updateThreshold()).to.eq(newUpdateThreshold);
		});

		it('emits UpdateThresholdSet event', async function () {
			await expect(contract.setUpdateThreshold(newUpdateThreshold))
				.to.emit(contract, 'UpdateThresholdSet')
				.withArgs(deployer, newUpdateThreshold);
		});

		it('reverts when sender does not have admin role', async function () {
			await expect(
				testerContract.setUpdateThreshold(newUpdateThreshold),
			).to.be.revertedWith('Caller is not the contract admin.');
		});
	});

	describe('hasPriceExpired', function () {
		it('returns true after updateThreshold', async function () {
			const now = Date.now();
			const unixTime = Math.floor(now / 1000);
			const clock = FakeTimers.install({ now, shouldAdvanceTime: true });

			clock.setSystemTime((unixTime + initialUpdateThreshold + 2) * 1000);
			await mineBlock(contract.provider as JsonRpcProvider);

			expect(await contract.hasPriceExpired()).to.be.true;

			clock.uninstall();
		});

		it('returns false before updateThreshold', async function () {
			expect(await contract.hasPriceExpired()).to.be.false;
		});

		it('reverts when updatedAt > block.timestamp', async function () {
			const unixTime = Math.floor(Date.now() / 1000);
			await contract.setUpdatedAt(unixTime + initialUpdateThreshold);
			await expect(contract.hasPriceExpired()).to.be.revertedWith(
				'block is older than last update',
			);
		});
	});
});
