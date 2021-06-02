import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseEther } from 'ethers/lib/utils';
import { JsonRpcSigner } from '@ethersproject/providers';

import { zeroAddress } from '../helpers/address';
import { parseETHmx } from '../helpers/conversions';
import {
	ETHmx,
	ETHmx__factory,
	MockERC20,
	MockERC20__factory,
} from '../../build/types/ethers-v5';

const contractName = 'ETHmx';

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: ETHmx;
	contractImpl: ETHmx;
	testerContract: ETHmx;
	testToken: MockERC20;
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
		await contract.setMinter(deployer);

		const contractImpl = ETHmx__factory.connect(
			(await deployments.get('ETHmxTest_Implementation')).address,
			deployerSigner,
		);

		const testerContract = contract.connect(testerSigner);

		const testToken = await new MockERC20__factory(deployerSigner).deploy(
			'Test Token',
			'TEST',
			18,
			0,
		);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			contractImpl,
			testerContract,
			testToken,
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

			expect(await contract.minter(), 'minter address mismatch').to.eq(
				deployer,
			);
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

	describe('burn', function () {
		it('should burn correct amount from sender', async function () {
			const { contract, deployer } = fixture;
			const minted = parseETHmx('10');

			await contract.mintTo(deployer, minted);

			const burnt = parseETHmx('5');
			await contract.burn(burnt);

			const balanceAfter = await contract.balanceOf(deployer);
			expect(balanceAfter).to.eq(minted.sub(burnt));
		});
	});

	describe('mintTo', function () {
		it('can only be called by minter', async function () {
			const { testerContract, tester } = fixture;

			await expect(testerContract.mintTo(tester, 1)).to.be.revertedWith(
				'caller is not the minter',
			);
		});

		it('reverts when paused', async function () {
			const { contract, tester } = fixture;

			await contract.pause();

			await expect(contract.mintTo(tester, 1)).to.be.revertedWith('paused');
		});

		it('mints correct amount to account', async function () {
			const { contract, tester } = fixture;
			const amount = parseETHmx('10');

			await expect(contract.mintTo(tester, amount))
				.to.emit(contract, 'Transfer')
				.withArgs(zeroAddress, tester, amount);

			expect(await contract.balanceOf(tester)).to.eq(amount);
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

	describe('recoverERC20', function () {
		it('can only be called by owner', async function () {
			const { testerContract, tester, testToken } = fixture;

			await expect(
				testerContract.recoverERC20(testToken.address, tester, 1),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should fail to recover nonexistent token', async function () {
			const { contract, tester, testToken } = fixture;
			await expect(
				contract.recoverERC20(testToken.address, tester, 1),
			).to.be.revertedWith('amount exceeds balance');
		});

		it('should transfer amount', async function () {
			const { contract, tester, testToken } = fixture;
			const amount = parseEther('10');

			await testToken.mint(contract.address, amount);
			await contract.recoverERC20(testToken.address, tester, amount);

			expect(
				await testToken.balanceOf(contract.address),
				'contract balance mismatch',
			).to.eq(0);
			expect(
				await testToken.balanceOf(tester),
				'target balance mismatch',
			).to.eq(amount);
		});

		it('should emit Recovered event', async function () {
			const { contract, deployer, tester, testToken } = fixture;
			const amount = parseEther('10');

			await testToken.mint(contract.address, amount);

			await expect(contract.recoverERC20(testToken.address, tester, amount))
				.to.emit(contract, 'Recovered')
				.withArgs(deployer, testToken.address, tester, amount);
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
