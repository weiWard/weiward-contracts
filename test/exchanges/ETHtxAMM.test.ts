import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseEther } from 'ethers/lib/utils';
import { JsonRpcSigner } from '@ethersproject/providers';

import { zeroAddress, zeroPadAddress } from '../helpers/address';
import { sendWETH, ethUsedOnGas, parseETHmx } from '../helpers/conversions';
import {
	MockETHmx,
	MockETHmx__factory,
	MockETHtxAMM,
	MockETHtxAMM__factory,
	ETHtxAMMv1__factory,
	WETH9__factory,
	WETH9,
} from '../../build/types/ethers-v5';
import { Contract } from 'ethers';

const contractName = 'ETHtxAMM';

const oneAddress = zeroPadAddress('0x1');

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: MockETHtxAMM;
	contractImpl: MockETHtxAMM;
	contractUpgraded: MockETHtxAMM;
	testerContract: MockETHtxAMM;
	ethmx: MockETHmx;
	weth: WETH9;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ deployments, getNamedAccounts, waffle }) => {
		const { deploy } = deployments;
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const weth = await new WETH9__factory(deployerSigner).deploy();

		const ethmx = await new MockETHmx__factory(deployerSigner).deploy(
			deployer,
		);

		const result = await deploy('MockETHtxAMM', {
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
		const contract = MockETHtxAMM__factory.connect(
			result.address,
			deployerSigner,
		);
		await contract.postInit({
			weth: weth.address,
			ethmx: ethmx.address,
		});

		const contractImpl = MockETHtxAMM__factory.connect(
			(await deployments.get('MockETHtxAMM_Implementation')).address,
			deployerSigner,
		);

		const ucResult = await deploy('ETHtxAMMv1', {
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
		const contractOld = ETHtxAMMv1__factory.connect(
			ucResult.address,
			deployerSigner,
		);
		await contractOld.postInit({
			ethtx: oneAddress,
			gasOracle: oneAddress,
			weth: weth.address,
			targetCRatioNum: 2,
			targetCRatioDen: 1,
			ethmx: ethmx.address,
		});
		await contractOld.setGeth(10);
		const pa = await deployments.get('ProxyAdmin');
		const proxyAdmin = new Contract(pa.address, pa.abi, deployerSigner);
		await proxyAdmin.upgrade(ucResult.address, contractImpl.address);
		const contractUpgraded = MockETHtxAMM__factory.connect(
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
			ethmx,
			weth,
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
			const { contract, contractImpl, deployer, ethmx, weth } = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);
			expect(
				await contractImpl.owner(),
				'implemenation owner address mismatch',
			).to.eq(deployer);

			expect(await contract.ethmx(), 'ethmx address mismatch').to.eq(
				ethmx.address,
			);

			expect(await contract.weth(), 'WETH address mismatch').to.eq(
				weth.address,
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

	describe('postInit', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;

			await expect(
				testerContract.postInit({
					weth: zeroAddress,
					ethmx: zeroAddress,
				}),
			).to.be.revertedWith('caller is not the owner');
		});
	});

	describe('postUpgrade', function () {
		beforeEach(async function () {
			const { contractUpgraded, weth } = fixture;
			await sendWETH(weth, contractUpgraded.address, 100);
		});

		it('should revert on new contract', async function () {
			const { contract } = fixture;
			await expect(contract.postUpgrade(zeroAddress)).to.be.revertedWith(
				'already executed',
			);
		});

		it('can only be called by owner', async function () {
			const { contractUpgraded, testerSigner } = fixture;
			const contract = contractUpgraded.connect(testerSigner);
			await expect(contract.postUpgrade(zeroAddress)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should revert on second call', async function () {
			const { contractUpgraded } = fixture;
			await expect(
				contractUpgraded.postUpgrade(zeroAddress),
				'first call reverted',
			).to.not.be.reverted;
			await expect(
				contractUpgraded.postUpgrade(zeroAddress),
				'second call did not revert',
			).to.be.revertedWith('already executed');
		});

		it('should transfer correct amount of WETH', async function () {
			const { contractUpgraded, weth } = fixture;
			await expect(
				contractUpgraded.postUpgrade(oneAddress),
				'transferred incorrect amount',
			)
				.to.emit(weth, 'Transfer')
				.withArgs(contractUpgraded.address, oneAddress, 46);

			expect(
				await weth.balanceOf(contractUpgraded.address),
				'contract balance mismatch',
			).to.eq(54);
		});

		it('should clear _gasOracle state', async function () {
			const { contractUpgraded } = fixture;
			expect(
				await contractUpgraded.gasOracledDeprecated(),
				'mismatch before call',
			).to.eq(oneAddress);
			await contractUpgraded.postUpgrade(zeroAddress);
			expect(
				await contractUpgraded.gasOracledDeprecated(),
				'mismatch after call',
			).to.eq(zeroAddress);
		});

		it('should clear _targetCRatioNum state', async function () {
			const { contractUpgraded } = fixture;
			expect(
				await contractUpgraded.targetCRatioNumDeprecated(),
				'mismatch before call',
			).to.eq(2);
			await contractUpgraded.postUpgrade(zeroAddress);
			expect(
				await contractUpgraded.targetCRatioNumDeprecated(),
				'mismatch after call',
			).to.eq(0);
		});

		it('should clear _targetCRatioDen state', async function () {
			const { contractUpgraded } = fixture;
			expect(
				await contractUpgraded.targetCRatioDenDeprecated(),
				'mismatch before call',
			).to.eq(1);
			await contractUpgraded.postUpgrade(zeroAddress);
			expect(
				await contractUpgraded.targetCRatioDenDeprecated(),
				'mismatch after call',
			).to.eq(0);
		});

		it('should clear _ethtx state', async function () {
			const { contractUpgraded } = fixture;
			expect(
				await contractUpgraded.ethtxDeprecated(),
				'mismatch before call',
			).to.eq(oneAddress);
			await contractUpgraded.postUpgrade(zeroAddress);
			expect(
				await contractUpgraded.ethtxDeprecated(),
				'mismatch after call',
			).to.eq(zeroAddress);
		});

		it('should clear _geth state', async function () {
			const { contractUpgraded } = fixture;
			expect(
				await contractUpgraded.gethDeprecated(),
				'mismatch before call',
			).to.eq(10);
			await contractUpgraded.postUpgrade(zeroAddress);
			expect(
				await contractUpgraded.gethDeprecated(),
				'mismatch after call',
			).to.eq(0);
		});
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

	describe('burnETHmx', function () {
		const amountEth = parseEther('10');
		const amountEthmx = amountEth.mul(2);

		it('should revert with no ETHmx supply', async function () {
			const { contract } = fixture;
			await expect(contract.burnETHmx(1, false)).to.be.revertedWith(
				'no ETHmx supply',
			);
		});

		it('should revert when paused', async function () {
			const { contract } = fixture;
			await contract.pause();
			await expect(contract.burnETHmx(1, false)).to.be.revertedWith('paused');
		});

		describe('with ETHmx', async function () {
			beforeEach(async function () {
				const { contract, deployer, weth, ethmx } = fixture;
				await sendWETH(weth, contract.address, amountEth);
				await ethmx.mockMint(deployer, amountEthmx);
				await ethmx.approve(contract.address, amountEthmx);
			});

			it('should burn ETHmx from account', async function () {
				const { deployer, contract, ethmx } = fixture;

				await expect(contract.burnETHmx(amountEthmx, false))
					.to.emit(ethmx, 'Transfer')
					.withArgs(contract.address, zeroAddress, amountEthmx);

				expect(await ethmx.balanceOf(deployer)).to.eq(0);
			});

			it('should send correct amount of WETH', async function () {
				const { deployer, contract, weth } = fixture;

				await expect(contract.burnETHmx(amountEthmx, true))
					.to.emit(weth, 'Transfer')
					.withArgs(contract.address, deployer, amountEth);

				expect(await weth.balanceOf(deployer)).to.eq(amountEth);
			});

			it('should send correct amount of ETH', async function () {
				const { deployerSigner, contract } = fixture;

				const prevBalance = await deployerSigner.getBalance();

				const tx = await contract.burnETHmx(amountEthmx, false);
				const ethSpent = await ethUsedOnGas(tx);

				const expected = prevBalance.sub(ethSpent).add(amountEth);

				expect(await deployerSigner.getBalance()).to.eq(expected);
			});

			it('should emit BurnedETHmx event', async function () {
				const { deployer, contract } = fixture;

				await expect(contract.burnETHmx(amountEthmx, false))
					.to.emit(contract, 'BurnedETHmx')
					.withArgs(deployer, amountEthmx);
			});

			it('should revert with zero amount', async function () {
				const { contract } = fixture;
				await expect(contract.burnETHmx(0, false)).to.be.revertedWith(
					'zero amount',
				);
			});

			it('should revert when not enough ETHmx', async function () {
				const { contract } = fixture;

				await expect(
					contract.burnETHmx(amountEthmx.add(1), false),
				).to.be.revertedWith('transfer amount exceeds balance');
			});

			it('should revert without ETHmx allowance', async function () {
				const { contract, ethmx } = fixture;
				await ethmx.approve(contract.address, 0);

				await expect(contract.burnETHmx(1, false)).to.be.revertedWith(
					'transfer amount exceeds allowance',
				);
			});
		});

		describe('with multiple parties', async function () {
			beforeEach(async function () {
				const {
					contract,
					deployer,
					tester,
					testerSigner,
					weth,
					ethmx,
				} = fixture;
				await sendWETH(weth, contract.address, amountEth.mul(2));
				await ethmx.mockMint(deployer, amountEthmx);
				await ethmx.mockMint(tester, amountEthmx);
				await ethmx.approve(contract.address, amountEthmx);
				await ethmx
					.connect(testerSigner)
					.approve(contract.address, amountEthmx);
			});

			it('should send correct amount of WETH', async function () {
				const { deployer, tester, contract, testerContract, weth } = fixture;

				await contract.burnETHmx(amountEthmx, true);
				expect(
					await weth.balanceOf(deployer),
					'deployer balance mismatch',
				).to.eq(amountEth);

				await testerContract.burnETHmx(amountEthmx, true);
				expect(await weth.balanceOf(tester), 'tester balance mismatch').to.eq(
					amountEth,
				);

				expect(
					await weth.balanceOf(contract.address),
					'contract balance mismatch',
				).to.eq(0);
			});
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

	describe('recoverUnsupportedERC20', function () {
		it('can only be called by owner', async function () {
			const { testerContract, ethmx, tester } = fixture;

			await expect(
				testerContract.recoverUnsupportedERC20(ethmx.address, tester, 1),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should revert on WETH', async function () {
			const { contract, tester, weth } = fixture;

			await expect(
				contract.recoverUnsupportedERC20(weth.address, tester, 1),
			).to.be.revertedWith('cannot recover WETH');
		});

		it('should fail to recover nonexistent token', async function () {
			const { contract, ethmx, tester } = fixture;
			await expect(
				contract.recoverUnsupportedERC20(ethmx.address, tester, 1),
			).to.be.revertedWith('amount exceeds balance');
		});

		it('should transfer amount', async function () {
			const { contract, ethmx, tester } = fixture;
			const amount = parseETHmx('10');

			await ethmx.mockMint(contract.address, amount);
			await contract.recoverUnsupportedERC20(ethmx.address, tester, amount);

			expect(
				await ethmx.balanceOf(contract.address),
				'contract balance mismatch',
			).to.eq(0);
			expect(await ethmx.balanceOf(tester), 'target balance mismatch').to.eq(
				amount,
			);
		});

		it('should emit RecoveredUnsupported event', async function () {
			const { contract, deployer, ethmx, tester } = fixture;
			const amount = parseEther('10');

			await ethmx.mockMint(contract.address, amount);

			await expect(
				contract.recoverUnsupportedERC20(ethmx.address, tester, amount),
			)
				.to.emit(contract, 'RecoveredUnsupported')
				.withArgs(deployer, ethmx.address, tester, amount);
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
