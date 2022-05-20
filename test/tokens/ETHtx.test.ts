import { expect } from 'chai';
import { deployments } from 'hardhat';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcSigner } from '@ethersproject/providers';
import { parseEther } from '@ethersproject/units';

import { zeroPadAddress } from '../helpers/address';
import {
	ETHtx,
	ETHtx__factory,
	ETHtxv1__factory,
} from '../../build/types/ethers-v5';
import { hexZeroPad } from 'ethers/lib/utils';

const contractName = 'ETHtx';

const adminRole = hexZeroPad('0x0', 32);
const oneAddress = zeroPadAddress('0x1');

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: ETHtx;
	contractImpl: ETHtx;
	contractUpgraded: ETHtx;
	testerContract: ETHtx;
}

const loadFixture = deployments.createFixture(
	async ({ deployments, getNamedAccounts, waffle }) => {
		const { deploy } = deployments;
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const result = await deploy('ETHtx', {
			from: deployer,
			log: true,
			proxy: {
				methodName: 'init',
				proxyContract: 'OpenZeppelinTransparentProxy',
				viaAdminContract: 'ProxyAdmin',
			},
			args: [deployer],
		});
		const contract = ETHtx__factory.connect(result.address, deployerSigner);

		const contractImpl = ETHtx__factory.connect(
			(await deployments.get('ETHtx_Implementation')).address,
			deployerSigner,
		);

		const ucResult = await deploy('ETHtxv1', {
			from: deployer,
			log: true,
			proxy: {
				methodName: 'init',
				proxyContract: 'OpenZeppelinTransparentProxy',
				viaAdminContract: 'ProxyAdmin',
			},
			args: [deployer],
		});
		const contractOld = ETHtxv1__factory.connect(
			ucResult.address,
			deployerSigner,
		);
		await contractOld.postInit({
			feeLogic: oneAddress,
			minters: [deployer],
			rebasers: [deployer],
		});
		const pa = await deployments.get('ProxyAdmin');
		const proxyAdmin = new Contract(pa.address, pa.abi, deployerSigner);
		await proxyAdmin.upgrade(ucResult.address, contractImpl.address);
		const contractUpgraded = ETHtx__factory.connect(
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
			const { contract, contractImpl, deployer } = fixture;

			expect(await contract.name(), 'name mismatch').to.eq(
				'Ethereum Transaction',
			);
			expect(await contract.symbol(), 'symbol mismatch').to.eq('ETHtx');
			expect(await contract.decimals(), 'decimals mismatch').to.eq(18);

			expect(
				await contract.hasRole(adminRole, deployer),
				'admin not set',
			).to.be.true;
			expect(
				await contractImpl.hasRole(adminRole, deployer),
				'implementation admin not set',
			).to.be.true;
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
				'access denied',
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
