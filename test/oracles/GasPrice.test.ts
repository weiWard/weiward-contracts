import { deployments } from 'hardhat';
import { expect } from 'chai';

import { GasPrice, GasPrice__factory } from '../../build/types/ethers-v5';

const initialGasPrice = 10000000;
const initialUpdateThreshold = Math.round(new Date().getTime() / 1000);

const loadFixture = deployments.createFixture(
	async ({ getNamedAccounts, waffle }) => {
		// Get accounts
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		// Deploy contract
		const contract = await new GasPrice__factory(deployerSigner).deploy(
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
	let contract: GasPrice;
	// let testerContract: GasPrice;

	beforeEach(async function () {
		({ contract } = await loadFixture());
	});

	it('initial state is correct', async function () {
		expect(await contract.gasPrice()).to.eq(initialGasPrice);
		expect(await contract.updateThreshold()).to.eq(initialUpdateThreshold);
	});
});
