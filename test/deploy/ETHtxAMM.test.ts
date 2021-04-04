import { expect } from 'chai';
import { deployments } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';
import { parseEther } from 'ethers/lib/utils';

import { ETHtxAMM, ETHtxAMM__factory } from '../../build/types/ethers-v5';

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: ETHtxAMM;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ deployments, getNamedAccounts, ethers }) => {
		await deployments.fixture();

		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = ethers.provider.getSigner(deployer);
		const testerSigner = ethers.provider.getSigner(tester);

		const contract = ETHtxAMM__factory.connect(
			(await deployments.get('ETHtxAMM_Proxy')).address,
			deployerSigner,
		);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
		};
	},
);

describe('ETHtxAMM Deployment', function () {
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
		it('should revert', async function () {
			const { contract, deployerSigner } = fixture;
			await expect(
				deployerSigner.sendTransaction({
					to: contract.address,
					value: parseEther('1'),
				}),
			).to.be.reverted;
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
