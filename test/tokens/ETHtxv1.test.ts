import { expect } from 'chai';
import { deployments } from 'hardhat';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcSigner } from '@ethersproject/providers';
import { parseEther } from '@ethersproject/units';

import { zeroAddress, zeroPadAddress } from '../helpers/address';
import { parseETHtx } from '../helpers/conversions';
import {
	MockETHtxv1 as MockETHtx,
	MockETHtxv1__factory as MockETHtx__factory,
	MockERC20,
	MockERC20__factory,
	MockFeeLogic__factory,
	MockFeeLogic,
	ETHtxV100__factory,
} from '../../build/types/ethers-v5';
import { hexZeroPad, solidityKeccak256 } from 'ethers/lib/utils';
import { MaxUint256 } from '@ethersproject/constants';

const contractName = 'ETHtxv1';

const feeRecipient = zeroPadAddress('0x1');
const feeNumerator = 75;
const feeDenominator = 1000;
const rebaseFeeNum = 1;
const rebaseFeeDen = 100;

const adminRole = hexZeroPad('0x0', 32);
const minterRole = solidityKeccak256(['string'], ['MINTER_ROLE']);
const rebaserRole = solidityKeccak256(['string'], ['REBASER_ROLE']);
const sharesMult = parseEther('1');

function calcTxFee(amount: BigNumber): BigNumber {
	return amount.mul(feeNumerator).div(feeDenominator);
}

function calcRebaseFee(amount: BigNumber): BigNumber {
	return amount.mul(rebaseFeeNum).div(rebaseFeeDen);
}

function undoRebaseFee(amount: BigNumber): BigNumber {
	return amount.mul(rebaseFeeDen).div(rebaseFeeDen - rebaseFeeNum);
}

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: MockETHtx;
	contractImpl: MockETHtx;
	contractUpgraded: MockETHtx;
	testerContract: MockETHtx;
	feeLogic: MockFeeLogic;
	testToken: MockERC20;
}

const loadFixture = deployments.createFixture(
	async ({ deployments, getNamedAccounts, waffle }) => {
		const { deploy } = deployments;
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const feeLogic = await new MockFeeLogic__factory(deployerSigner).deploy({
			owner: deployer,
			recipient: feeRecipient,
			feeRateNumerator: feeNumerator,
			feeRateDenominator: feeDenominator,
			exemptions: [],
			rebaseInterval: 0,
			rebaseFeeRateNum: rebaseFeeNum,
			rebaseFeeRateDen: rebaseFeeDen,
			rebaseExemptions: [],
		});

		const result = await deploy('MockETHtx', {
			from: deployer,
			log: true,
			proxy: {
				methodName: 'init',
				proxyContract: 'OpenZeppelinTransparentProxy',
				viaAdminContract: 'ProxyAdmin',
			},
			args: [deployer],
		});
		const contract = MockETHtx__factory.connect(
			result.address,
			deployerSigner,
		);
		await contract.postInit({
			feeLogic: feeLogic.address,
			minters: [deployer],
			rebasers: [deployer],
		});

		const contractImpl = MockETHtx__factory.connect(
			(await deployments.get('MockETHtx_Implementation')).address,
			deployerSigner,
		);

		const ucResult = await deploy('ETHtx_v1_0_0', {
			from: deployer,
			log: true,
			proxy: {
				methodName: 'init',
				proxyContract: 'OpenZeppelinTransparentProxy',
				viaAdminContract: 'ProxyAdmin',
			},
			args: [deployer],
		});
		const contractOld = ETHtxV100__factory.connect(
			ucResult.address,
			deployerSigner,
		);
		await contractOld.postInit({
			feeLogic: zeroAddress,
			minter: deployer,
		});
		await contractOld.mint(deployer, 1);
		const pa = await deployments.get('ProxyAdmin');
		const proxyAdmin = new Contract(pa.address, pa.abi, deployerSigner);
		await proxyAdmin.upgrade(ucResult.address, contractImpl.address);
		const contractUpgraded = MockETHtx__factory.connect(
			ucResult.address,
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
			contractUpgraded,
			testerContract,
			feeLogic,
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
			const { contract, contractImpl, deployer, feeLogic } = fixture;

			expect(await contract.name(), 'name mismatch').to.eq(
				'Ethereum Transaction',
			);
			expect(await contract.symbol(), 'symbol mismatch').to.eq('ETHtx');
			expect(await contract.decimals(), 'decimals mismatch').to.eq(18);

			expect(await contract.lastRebaseTime(), 'lastRebaseTime mismatch').to.eq(
				0,
			);

			expect(
				await contract.hasRole(adminRole, deployer),
				'admin not set',
			).to.be.true;
			expect(
				await contractImpl.hasRole(adminRole, deployer),
				'implemenation admin not set',
			).to.be.true;

			expect(await contract.feeLogic(), 'feeLogic address mismatch').to.eq(
				feeLogic.address,
			);

			expect(
				await contract.hasRole(minterRole, deployer),
				'minter not set',
			).to.be.true;

			expect(
				await contract.hasRole(rebaserRole, deployer),
				'rebaser not set',
			).to.be.true;

			expect(
				await contract.sharesPerTokenX18(),
				'sharesPerToken mismatch',
			).to.eq(sharesMult);
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
		it('can only be called by admin', async function () {
			const { testerContract } = fixture;

			await expect(
				testerContract.postInit({
					feeLogic: zeroAddress,
					minters: [],
					rebasers: [],
				}),
			).to.be.revertedWith('access denied');
		});
	});

	describe('postUpgrade', function () {
		it('should revert on new contract', async function () {
			const { contract } = fixture;
			await expect(contract.postUpgrade(zeroAddress, [])).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('can only be called by owner', async function () {
			const { contractUpgraded, testerSigner } = fixture;
			const contract = contractUpgraded.connect(testerSigner);
			await expect(contract.postUpgrade(zeroAddress, [])).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should revert on second call', async function () {
			const { contractUpgraded } = fixture;
			await expect(
				contractUpgraded.postUpgrade(zeroAddress, []),
				'first call reverted',
			).to.not.be.reverted;
			await expect(
				contractUpgraded.postUpgrade(zeroAddress, []),
				'second call did not revert',
			).to.be.revertedWith('caller is not the owner');
		});

		it('should set feeLogic', async function () {
			const { contractUpgraded, feeLogic } = fixture;
			await contractUpgraded.postUpgrade(feeLogic.address, []);
			expect(await contractUpgraded.feeLogic()).to.eq(feeLogic.address);
		});

		it('should set totalShares', async function () {
			const { contractUpgraded } = fixture;
			expect(
				await contractUpgraded.totalShares(),
				'mismatch before call',
			).to.eq(0);
			await contractUpgraded.postUpgrade(zeroAddress, []);
			expect(
				await contractUpgraded.totalShares(),
				'mismatch after call',
			).to.eq(1);
		});

		it('should set sharesPerToken', async function () {
			const { contractUpgraded } = fixture;
			expect(
				await contractUpgraded.sharesPerTokenX18(),
				'mismatch before call',
			).to.eq(0);
			await contractUpgraded.postUpgrade(zeroAddress, []);
			expect(
				await contractUpgraded.sharesPerTokenX18(),
				'mismatch after call',
			).to.eq(sharesMult);
		});

		it('should set admin role', async function () {
			const { contractUpgraded, deployer } = fixture;
			await contractUpgraded.postUpgrade(zeroAddress, []);
			expect(await contractUpgraded.hasRole(adminRole, deployer)).to.be.true;
		});

		it('should set minter role', async function () {
			const { contractUpgraded, deployer } = fixture;
			await contractUpgraded.postUpgrade(zeroAddress, []);
			expect(await contractUpgraded.hasRole(minterRole, deployer)).to.be.true;
		});

		it('should set rebaser role', async function () {
			const { contractUpgraded } = fixture;
			const rebaser = zeroPadAddress('0x1');
			await contractUpgraded.postUpgrade(zeroAddress, [rebaser]);
			expect(await contractUpgraded.hasRole(rebaserRole, rebaser)).to.be.true;
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

	describe('balanceOf', function () {
		it('should return zero with no tokens', async function () {
			const { contract, deployer } = fixture;
			expect(await contract.balanceOf(deployer)).to.eq(0);
		});

		it('should return the token balance', async function () {
			const { contract, deployer } = fixture;
			const amount = parseETHtx('10');
			await contract.mockMint(deployer, amount);
			expect(await contract.balanceOf(deployer)).to.eq(amount);
		});
	});

	describe('burn', function () {
		const initSupply = parseETHtx('1');
		const initShares = parseETHtx('100').add(initSupply);

		function sharesPerToken(shares: BigNumber, supply: BigNumber): BigNumber {
			return shares.mul(sharesMult).div(supply);
		}

		beforeEach(async function () {
			const { contract } = fixture;
			await contract.mint(contract.address, initSupply);
			await contract.mockMintShares(
				contract.address,
				initShares.sub(initSupply),
			);
		});

		it('can only be called by minter', async function () {
			const { testerContract, deployer } = fixture;
			await expect(testerContract.burn(deployer, 1)).to.be.revertedWith(
				'access denied',
			);
		});

		it('should revert when paused', async function () {
			const { contract, deployer } = fixture;
			await contract.pause();
			await expect(contract.burn(deployer, 1)).to.be.revertedWith('paused');
		});

		it('should burn tokens', async function () {
			const { contract, tester } = fixture;
			const amount = parseETHtx('100');
			await contract.mint(tester, amount);

			await expect(contract.burn(tester, amount), 'did not emit Transfer')
				.to.emit(contract, 'Transfer')
				.withArgs(tester, zeroAddress, amount);

			expect(await contract.balanceOf(tester), 'balance mismatch').to.eq(0);

			expect(await contract.totalSupply(), 'totalSupply mismatch').to.eq(
				initSupply,
			);
		});

		it('should burn shares', async function () {
			const { contract, tester } = fixture;
			const amount = parseETHtx('100');

			await contract.mint(tester, amount);
			await contract.burn(tester, amount);

			expect(await contract.sharesBalanceOf(tester), 'balance mismatch').to.eq(
				0,
			);

			expect(await contract.totalShares(), 'totalShares mismatch').to.eq(
				initShares,
			);
		});

		it('should keep sharesPerToken constant', async function () {
			const { contract, tester } = fixture;
			const amount = parseETHtx('100');
			const expected = sharesPerToken(initShares, initSupply);

			await contract.mint(tester, amount);
			await contract.burn(tester, amount);

			expect(
				await contract.sharesPerTokenX18(),
				'contract sharesPerToken mismatch',
			).to.eq(expected);
		});
	});

	describe('mint', function () {
		const initSupply = parseETHtx('1');
		const initShares = parseETHtx('100').add(initSupply);

		function sharesPerToken(shares: BigNumber, supply: BigNumber): BigNumber {
			return shares.mul(sharesMult).div(supply);
		}

		beforeEach(async function () {
			const { contract } = fixture;
			await contract.mint(contract.address, initSupply);
			await contract.mockMintShares(
				contract.address,
				initShares.sub(initSupply),
			);
		});

		it('can only be called by minter', async function () {
			const { testerContract, tester } = fixture;
			await expect(testerContract.mint(tester, 1)).to.be.revertedWith(
				'access denied',
			);
		});

		it('should revert when paused', async function () {
			const { contract, deployer } = fixture;
			await contract.pause();
			await expect(contract.mint(deployer, 1)).to.be.revertedWith('paused');
		});

		it('should mint tokens', async function () {
			const { contract, tester } = fixture;
			const amount = parseETHtx('100');

			await expect(contract.mint(tester, amount), 'did not emit Transfer')
				.to.emit(contract, 'Transfer')
				.withArgs(zeroAddress, tester, amount);

			expect(await contract.balanceOf(tester), 'balance mismatch').to.eq(
				amount,
			);

			expect(await contract.totalSupply(), 'totalSupply mismatch').to.eq(
				initSupply.add(amount),
			);
		});

		it('should mint shares', async function () {
			const { contract, tester } = fixture;
			const amount = parseETHtx('100');
			const shares = amount
				.mul(sharesPerToken(initShares, initSupply))
				.div(sharesMult);

			await contract.mint(tester, amount);

			expect(await contract.sharesBalanceOf(tester), 'balance mismatch').to.eq(
				shares,
			);

			expect(await contract.totalShares(), 'totalShares mismatch').to.eq(
				initShares.add(shares),
			);
		});

		it('should keep sharesPerToken constant', async function () {
			const { contract, tester } = fixture;
			const amount = parseETHtx('100');
			const shares = amount
				.mul(sharesPerToken(initShares, initSupply))
				.div(sharesMult);
			const expected = sharesPerToken(initShares, initSupply);

			await contract.mint(tester, amount);

			expect(
				await contract.sharesPerTokenX18(),
				'contract sharesPerToken mismatch',
			).to.eq(expected);

			expect(
				sharesPerToken(initShares.add(shares), initSupply.add(amount)),
				'calculated sharesPerToken mismatch',
			).to.eq(expected);
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

		it('can only be called by admin', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.pause()).to.be.revertedWith('access denied');
		});
	});

	describe('rebase', function () {
		it('can only be called by rebaser', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.rebase()).to.be.revertedWith(
				'access denied',
			);
		});

		it('should revert when paused', async function () {
			const { contract } = fixture;
			await contract.pause();
			await expect(contract.rebase()).to.be.revertedWith('paused');
		});

		it('should do nothing when totalShares == 0', async function () {
			const { contract } = fixture;
			await expect(contract.rebase()).to.not.emit(contract, 'Rebased');
		});

		describe('when totalShares > 0', function () {
			const initSupply = parseETHtx('100');
			const initShares = initSupply;
			const newTotalShares = undoRebaseFee(initShares);

			beforeEach(async function () {
				const { contract } = fixture;
				await contract.mint(contract.address, initSupply);
			});

			it('should revert when calling twice before interval', async function () {
				const { contract, feeLogic } = fixture;
				await feeLogic.setRebaseInterval(86400);
				await contract.rebase();
				await expect(contract.rebase()).to.be.revertedWith('too soon');
			});

			it('should increase totalShares', async function () {
				const { contract } = fixture;
				await contract.rebase();
				expect(await contract.totalShares()).to.eq(newTotalShares);
			});

			it('should keep totalSupply constant', async function () {
				const { contract } = fixture;
				await contract.rebase();
				expect(await contract.totalSupply()).to.eq(initSupply);
			});

			it('should increase sharesPerToken', async function () {
				const { contract } = fixture;

				expect(
					await contract.sharesPerTokenX18(),
					'mismatch before call',
				).to.eq(sharesMult);

				await contract.rebase();

				expect(
					await contract.sharesPerTokenX18(),
					'mismatch after call',
				).to.eq(newTotalShares.mul(sharesMult).div(initSupply));
			});

			it('should update lastRebaseTime', async function () {
				const { contract } = fixture;
				await contract.rebase();
				expect(await contract.lastRebaseTime()).to.not.eq(0);
			});

			it('should mint new shares and adjust token balances', async function () {
				const { contract } = fixture;
				const spt = newTotalShares.mul(sharesMult).div(initSupply);
				const rewardsShares = newTotalShares.sub(initShares);
				const rewards = rewardsShares.mul(sharesMult).div(spt);
				const contractShares = initShares;
				const contractTokens = initSupply.sub(rewards);

				expect(rewardsShares, 'calculated rewards shares mismatch').to.eq(
					parseETHtx('1.010101010101010101'),
				);
				expect(rewards, 'calculated rewards tokens mismatch').to.eq(
					parseETHtx('1'),
				);
				expect(contractShares, 'calculated contract shares mismatch').to.eq(
					parseETHtx('100'),
				);
				expect(contractTokens, 'calculated contract tokens mismatch').to.eq(
					parseETHtx('99'),
				);

				await contract.rebase();

				expect(
					await contract.sharesBalanceOf(feeRecipient),
					'beneficiary shares balance mismatch',
				).to.eq(rewardsShares);

				expect(
					await contract.balanceOf(feeRecipient),
					'beneficiary token balance mismatch',
				).to.eq(rewards);

				expect(
					await contract.sharesBalanceOf(contract.address),
					'contract shares balance mismatch',
				).to.eq(contractShares);

				expect(
					await contract.balanceOf(contract.address),
					'contract token balance mismatch',
				).to.eq(contractTokens);
			});

			it('should increase exempt shares to maintain tokens', async function () {
				const { contract, feeLogic, tester } = fixture;
				const exemptTokens = parseETHtx('10');
				await contract.mint(tester, exemptTokens);
				const supply = initSupply.add(exemptTokens);
				const shares = initShares.add(exemptTokens);

				const newTotalShares = undoRebaseFee(shares);
				const spt = newTotalShares.mul(sharesMult).div(supply);
				const newExemptShares = undoRebaseFee(exemptTokens);
				const addedExemptShares = newExemptShares.sub(exemptTokens);
				const rewardsShares = newTotalShares
					.sub(shares)
					.sub(addedExemptShares);
				const rewards = rewardsShares.mul(sharesMult).div(spt);
				const contractShares = initShares;
				const contractTokens = initSupply.sub(rewards);

				expect(rewardsShares, 'calculated rewards shares mismatch').to.eq(
					parseETHtx('1.010101010101010101'),
				);
				expect(rewards, 'calculated rewards tokens mismatch').to.eq(
					parseETHtx('1'),
				);
				expect(newExemptShares, 'calculated exempt shares mismatch').to.eq(
					parseETHtx('10.10101010101010101'),
				);
				expect(exemptTokens, 'calculated exempt tokens mismatch').to.eq(
					parseETHtx('10'),
				);
				expect(contractShares, 'calculated contract shares mismatch').to.eq(
					parseETHtx('100'),
				);
				expect(contractTokens, 'calculated contract tokens mismatch').to.eq(
					parseETHtx('99'),
				);

				await feeLogic.setRebaseExempt(tester, true);

				await contract.rebase();

				expect(
					await contract.sharesBalanceOf(tester),
					'exempt shares mismatch',
				).to.eq(newExemptShares);

				expect(
					await contract.balanceOf(tester),
					'exempt tokens mismatch',
				).to.eq(exemptTokens);

				expect(
					await contract.sharesBalanceOf(feeRecipient),
					'beneficiary shares mismatch',
				).to.eq(rewardsShares);

				expect(
					await contract.balanceOf(feeRecipient),
					'beneficiary tokens mismatch',
				).to.eq(rewards);

				expect(
					await contract.sharesBalanceOf(contract.address),
					'contract shares balance mismatch',
				).to.eq(contractShares);

				expect(
					await contract.balanceOf(contract.address),
					'contract token balance mismatch',
				).to.eq(contractTokens);
			});

			it('should succeed when all shares are exempt', async function () {
				const { contract, feeLogic } = fixture;
				await feeLogic.setRebaseExempt(contract.address, true);

				await expect(contract.rebase(), 'did not emit Rebased event').to.emit(
					contract,
					'Rebased',
				);

				expect(await contract.sharesBalanceOf(contract.address)).to.eq(
					newTotalShares,
				);
			});

			it('should emit Rebased event', async function () {
				const { contract, deployer } = fixture;
				await expect(contract.rebase())
					.to.emit(contract, 'Rebased')
					.withArgs(deployer, newTotalShares);
			});

			describe('handles overflow', function () {
				const newTotal = MaxUint256.div(sharesMult);
				const newShares = newTotal
					.sub(initShares)
					.sub(calcRebaseFee(newTotal));

				it('should succeed on limit', async function () {
					const { contract } = fixture;
					await contract.mockMintShares(feeRecipient, newShares);
					await expect(contract.rebase()).to.emit(contract, 'Rebased');
				});

				it('should revert on overflow', async function () {
					const { contract } = fixture;
					await contract.mockMintShares(feeRecipient, newShares.add(1));
					await expect(contract.rebase()).to.be.revertedWith(
						'multiplication overflow',
					);
				});
			});
		});
	});

	describe('recoverERC20', function () {
		it('can only be called by admin', async function () {
			const { testerContract, tester, testToken } = fixture;

			await expect(
				testerContract.recoverERC20(testToken.address, tester, 1),
			).to.be.revertedWith('access denied');
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

	describe('setFeeLogic', function () {
		const newFeeLogic = zeroPadAddress('0x3');

		it('can only be called by admin', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setFeeLogic(newFeeLogic)).to.be.revertedWith(
				'access denied',
			);
		});

		it('should revert when set to zero address', async function () {
			const { contract } = fixture;
			await expect(contract.setFeeLogic(zeroAddress)).to.be.revertedWith(
				'zero address',
			);
		});

		it('should set feeLogic address', async function () {
			const { contract } = fixture;
			await contract.setFeeLogic(newFeeLogic);
			expect(await contract.feeLogic()).to.eq(newFeeLogic);
		});

		it('should emit FeeLogicSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setFeeLogic(newFeeLogic))
				.to.emit(contract, 'FeeLogicSet')
				.withArgs(deployer, newFeeLogic);
		});
	});

	describe('totalSupply', function () {
		it('should return total amount of tokens', async function () {
			const { contract } = fixture;
			const amount = parseETHtx('10');
			await contract.mint(zeroAddress, amount);
			expect(await contract.totalSupply()).to.eq(amount);
		});
	});

	describe('transfer', function () {
		const amount = parseEther('100');
		const fee = calcTxFee(amount);

		beforeEach(async function () {
			const { contract, deployer } = fixture;
			await contract.mint(deployer, amount);
		});

		it('should transfer with fee', async function () {
			const { contract, tester } = fixture;

			await contract.transfer(tester, amount);

			expect(
				await contract.balanceOf(feeRecipient),
				'fee recipient balance mismatch',
			).to.eq(fee);

			expect(
				await contract.balanceOf(tester),
				'target balance mismatch',
			).to.eq(amount.sub(fee));
		});

		it('should transfer full amount without fee', async function () {
			const { contract, feeLogic, tester } = fixture;
			await feeLogic.setFeeRate(0, 1);
			await contract.transfer(tester, amount);
			expect(await contract.balanceOf(tester)).to.eq(amount);
		});

		it('should emit regular Transfer event', async function () {
			const { contract, deployer, tester } = fixture;
			await expect(contract.transfer(tester, amount))
				.to.emit(contract, 'Transfer')
				.withArgs(deployer, tester, amount.sub(fee));
		});

		it('should emit fee Transfer event', async function () {
			const { contract, deployer, tester } = fixture;
			await expect(contract.transfer(tester, amount))
				.to.emit(contract, 'Transfer')
				.withArgs(deployer, feeRecipient, fee);
		});

		it('should notify feeLogic contract', async function () {
			const { contract, tester, feeLogic } = fixture;
			await expect(contract.transfer(tester, amount))
				.to.emit(feeLogic, 'Notified')
				.withArgs(fee);
		});

		it('should revert on transfer to zero address', async function () {
			const { contract } = fixture;
			await expect(contract.transfer(zeroAddress, amount)).to.be.revertedWith(
				'to the zero address',
			);
		});

		it('should revert when amount exceeds balance', async function () {
			const { contract, tester } = fixture;
			await expect(
				contract.transfer(tester, amount.add(1)),
			).to.be.revertedWith('amount exceeds balance');
		});
	});

	describe('transferFrom', function () {
		const amount = parseEther('100');
		const fee = calcTxFee(amount);

		beforeEach(async function () {
			const { contract, deployer } = fixture;
			await contract.mint(deployer, amount);
		});

		it('should transfer with fee', async function () {
			const { contract, deployer, tester } = fixture;

			await contract.increaseAllowance(deployer, amount);
			await contract.transferFrom(deployer, tester, amount);

			expect(
				await contract.balanceOf(feeRecipient),
				'fee recipient balance mismatch',
			).to.eq(fee);

			expect(
				await contract.balanceOf(tester),
				'target balance mismatch',
			).to.eq(amount.sub(fee));
		});

		it('should revert on transferFrom zero address', async function () {
			const { contract, tester } = fixture;
			await expect(
				contract.transferFrom(zeroAddress, tester, amount),
			).to.be.revertedWith('from the zero address');
		});

		it('should revert without allowance', async function () {
			const { contract, deployer, tester } = fixture;
			await expect(
				contract.transferFrom(deployer, tester, 1),
			).to.be.revertedWith('amount exceeds allowance');
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

		it('can only be called by admin', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.unpause()).to.be.revertedWith(
				'access denied',
			);
		});
	});
});
