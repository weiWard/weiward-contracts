import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseEther } from 'ethers/lib/utils';
import { JsonRpcSigner } from '@ethersproject/providers';
import { Contract } from 'ethers';

import { ETHmx, ETHmx__factory } from '../../build/types/ethers-v5';

const contractName = 'ETHmx';

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: ETHmx;
	contractImpl: ETHmx;
	contractUpgraded: ETHmx;
	testerContract: ETHmx;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ deployments, getNamedAccounts, waffle }) => {
		const { deploy } = deployments;
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const result = await deploy('ETHmxTest', {
			contract: 'ETHmx',
			from: deployer,
			log: true,
			proxy: {
				methodName: 'init',
				proxyContract: 'OpenZeppelinTransparentProxy',
				viaAdminContract: 'ProxyAdmin',
			},
			args: [deployer],
		});
		const contract = ETHmx__factory.connect(result.address, deployerSigner);

		const contractImpl = ETHmx__factory.connect(
			(await deployments.get('ETHmxTest_Implementation')).address,
			deployerSigner,
		);

		const ucResult = await deploy('ETHmxv1', {
			from: deployer,
			log: true,
			proxy: {
				owner: deployer,
				methodName: 'init',
				proxyContract: 'OpenZeppelinTransparentProxy',
				viaAdminContract: 'ProxyAdmin',
			},
			args: [deployer],
		});
		const pa = await deployments.get('ProxyAdmin');
		const proxyAdmin = new Contract(pa.address, pa.abi, deployerSigner);
		await proxyAdmin.upgrade(ucResult.address, contractImpl.address);
		const contractUpgraded = ETHmx__factory.connect(
			ucResult.address,
			deployerSigner,
		);

		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			contractImpl,
			contractUpgraded,
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
			const { deployer, contract, contractImpl } = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);
			expect(
				await contractImpl.owner(),
				'implemenation owner address mismatch',
			).to.eq(deployer);
		});
	});

	describe('init', function () {
		it('should revert on proxy address', async function () {
			const { contract, tester } = fixture;

			await expect(contract.init(tester)).to.be.revertedWith(
				'contract is already initialized',
			);
		});

		it('should revert on implementation address', async function () {
			const { contractImpl, tester } = fixture;

			await expect(contractImpl.init(tester)).to.be.revertedWith(
				'contract is already initialized',
			);
		});
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

	describe('destroy', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.destroy()).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should selfdestruct proxy and implementation', async function () {
			const { contract, contractImpl, deployer } = fixture;

			await expect(contract.destroy(), 'proxy failed to destroy')
				.to.emit(contract, 'Destroyed')
				.withArgs(deployer);

			await expect(contractImpl.destroy(), 'implementation failed to destroy')
				.to.emit(contractImpl, 'Destroyed')
				.withArgs(deployer);
		});
	});
});
