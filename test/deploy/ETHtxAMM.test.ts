import { expect } from 'chai';
import { deployments } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';
import { parseEther } from 'ethers/lib/utils';

import {
	ETHtxAMM,
	ETHtxAMM__factory,
	WETH9,
	WETH9__factory,
} from '../../build/types/ethers-v5';
import { getVersionTag } from '../../utils/deploy';

const version = getVersionTag();

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: ETHtxAMM;
	weth: WETH9;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ deployments, getNamedAccounts, ethers }) => {
		await deployments.fixture(version);

		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = ethers.provider.getSigner(deployer);
		const testerSigner = ethers.provider.getSigner(tester);

		const contract = ETHtxAMM__factory.connect(
			(await deployments.get('ETHtxAMM_Proxy')).address,
			deployerSigner,
		);

		const weth = WETH9__factory.connect(
			(await deployments.get('WETH9')).address,
			deployerSigner,
		);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			weth,
		};
	},
);

describe.skip('ETHtxAMM Deployment', function () {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('should have correct init state', async function () {
		const { contract } = fixture;

		const [num, den] = await contract.targetCRatio();
		expect(num, 'targetCRatio numerator mismatch').to.eq(2);
		expect(den, 'targetCRatio denominator mismatch').to.eq(1);
	});

	describe('receive', function () {
		it('should convert to WETH', async function () {
			const { contract, deployerSigner, weth } = fixture;
			const amount = parseEther('1');

			await expect(
				deployerSigner.sendTransaction({
					to: contract.address,
					value: amount,
				}),
			)
				.to.emit(weth, 'Deposit')
				.withArgs(contract.address, amount);

			expect(await weth.balanceOf(contract.address)).to.eq(amount);
		});
	});

	it('setTargetCRatio should succeed', async function () {
		const { contract, deployer } = fixture;
		const newNum = 7;
		const newDen = 5;

		await expect(contract.setTargetCRatio(newNum, newDen))
			.to.emit(contract, 'TargetCRatioSet')
			.withArgs(deployer, newNum, newDen);

		const [num, den] = await contract.targetCRatio();
		expect(num, 'numerator mismatch').to.eq(newNum);
		expect(den, 'denominator mismatch').to.eq(newDen);
	});
});
