import { deployments } from 'hardhat';
import { expect } from 'chai';
import FakeTimers from '@sinonjs/fake-timers';
import { JsonRpcProvider } from '@ethersproject/providers';

import { mineBlock } from '../helpers/timeTravel';
import {
	MockGasPrice,
	MockGasPrice__factory,
} from '../../build/types/ethers-v5';

const initialGasPrice = 10000000;
const initialUpdateThreshold = 1800; // 1800s (30m)

const loadFixture = deployments.createFixture(
	async ({ getNamedAccounts, waffle }) => {
		// Get accounts
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		// Deploy contract
		const contract = await new MockGasPrice__factory(deployerSigner).deploy(
			initialUpdateThreshold,
			initialGasPrice,
		);
		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			tester,
			contract,
			testerContract,
		};
	},
);

describe.only('GasPrice', function () {
	// let deployer: string;
	// let tester: string;
	let contract: MockGasPrice;
	// let testerContract: GasPrice;

	beforeEach(async function () {
		({ contract } = await loadFixture());
	});

	it('initial state is correct', async function () {
		expect(await contract.gasPrice()).to.eq(initialGasPrice);
		expect(await contract.updateThreshold()).to.eq(initialUpdateThreshold);
	});

	describe('setGasPrice', function () {
		it('Sets gasPrice correctly');

		it('Sets updatedAt correctly');

		it('emits GasPriceUpdate event');

		it('reverts when sender does not have the oracle role');
	});

	describe('setUpdateThreshold', function () {
		it('Sets updateThreshold correctly');

		it('emits UpdateThresholdSet event');

		it('reverts when sender does not have admin role');
	});

	describe('hasPriceExpired', function () {
		let unixTime: number;
		let clock: FakeTimers.InstalledClock;

		beforeEach(function () {
			const now = Date.now();
			unixTime = Math.floor(now / 1000);
			clock = FakeTimers.install({ now, shouldAdvanceTime: true });
		});

		afterEach(function () {
			clock.reset();
		});

		after(function () {
			clock.uninstall();
		});

		it('returns true after updateThreshold', async function () {
			clock.setSystemTime((unixTime + initialUpdateThreshold + 2) * 1000);
			await mineBlock(contract.provider as JsonRpcProvider);
			expect(await contract.hasPriceExpired()).to.be.true;
		});

		it('returns false before updateThreshold', async function () {
			expect(await contract.hasPriceExpired()).to.be.false;
		});

		it('reverts when updatedAt > block.timestamp', async function () {
			await contract.setUpdatedAt(unixTime + initialUpdateThreshold);
			await expect(contract.hasPriceExpired()).to.be.revertedWith(
				'block is older than last update',
			);
		});
	});
});
