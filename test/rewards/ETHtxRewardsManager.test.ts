import { expect } from 'chai';
import { deployments } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';
import { Contract } from 'ethers';

import {
	ETHtxRewardsManager,
	ETHtxRewardsManager__factory,
	ETHtxRewardsManagerv1__factory,
	WETH9,
	WETH9__factory,
} from '../../build/types/ethers-v5';
import { zeroAddress, zeroPadAddress } from '../helpers/address';
import { sendWETH } from '../helpers/conversions';

const contractName = 'ETHtxRewardsManager';

const oneAddress = zeroPadAddress('0x1');

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: ETHtxRewardsManager;
	contractImpl: ETHtxRewardsManager;
	contractUpgraded: ETHtxRewardsManager;
	testerContract: ETHtxRewardsManager;
	weth: WETH9;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ deployments, getNamedAccounts, waffle }) => {
		const { deploy } = deployments;
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const weth = await new WETH9__factory(deployerSigner).deploy();

		const result = await deploy('ETHtxRewardsManager', {
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
		const contract = ETHtxRewardsManager__factory.connect(
			result.address,
			deployerSigner,
		);
		await contract.postInit(weth.address);

		const contractImpl = ETHtxRewardsManager__factory.connect(
			(await deployments.get('ETHtxRewardsManager_Implementation')).address,
			deployerSigner,
		);

		const ucResult = await deploy('ETHtxRewardsManagerv1', {
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
		const contractOld = ETHtxRewardsManagerv1__factory.connect(
			ucResult.address,
			deployerSigner,
		);
		await contractOld.ethtxRewardsManagerPostInit({
			defaultRecipient: oneAddress,
			rewardsToken: weth.address,
			ethmxRewards: zeroAddress,
			ethtx: zeroAddress,
			ethtxAMM: zeroAddress,
			lpRewards: zeroAddress,
			shares: [],
		});
		const pa = await deployments.get('ProxyAdmin');
		const proxyAdmin = new Contract(pa.address, pa.abi, deployerSigner);
		await proxyAdmin.upgrade(ucResult.address, contractImpl.address);
		const contractUpgraded = ETHtxRewardsManager__factory.connect(
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
			weth,
		};
	},
);

describe.only(contractName, function () {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('constructor', function () {
		it('initial state is correct', async function () {
			const { contract, contractImpl, deployer } = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);
			expect(
				await contractImpl.owner(),
				'implementation owner address mismatch',
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

	describe('postInit', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;

			await expect(testerContract.postInit(zeroAddress)).to.be.revertedWith(
				'caller is not the owner',
			);
		});
	});

	describe('postUpgrade', function () {
		beforeEach(async function () {
			const { contractUpgraded, weth } = fixture;
			await sendWETH(weth, contractUpgraded.address, 100);
		});

		it('can only be called by owner', async function () {
			const { contractUpgraded, testerSigner } = fixture;
			const contract = contractUpgraded.connect(testerSigner);
			await expect(contract.postUpgrade(zeroAddress)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should transfer correct amount of WETH', async function () {
			const { contractUpgraded, weth } = fixture;
			await expect(
				contractUpgraded.postUpgrade(oneAddress),
				'transferred incorrect amount',
			)
				.to.emit(weth, 'Transfer')
				.withArgs(contractUpgraded.address, oneAddress, 100);

			expect(
				await weth.balanceOf(contractUpgraded.address),
				'contract balance mismatch',
			).to.eq(0);

			expect(
				await weth.balanceOf(oneAddress),
				'recipient balance mismatch',
			).to.eq(100);
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
