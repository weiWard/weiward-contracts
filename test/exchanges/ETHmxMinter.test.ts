import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { BigNumber } from '@ethersproject/bignumber';
import { JsonRpcSigner } from '@ethersproject/providers';
import { MaxUint256, One, Zero } from '@ethersproject/constants';

import { zeroAddress, zeroPadAddress } from '../helpers/address';
import {
	parseGwei,
	parseETHtx,
	ethToEthtx,
	ethtxToEth,
	sendWETH,
	ethmxFromEth as ethmxFromEthOrig,
	IETHmxMintParams,
} from '../helpers/conversions';
import {
	sushiswapRouterFixture,
	uniswapRouterFixture,
} from '../helpers/fixtures';
import {
	ETHmx,
	ETHmx__factory,
	ETHmxMinter,
	ETHmxMinter__factory,
	ETHtxAMM,
	ETHtxAMM__factory,
	MockETHtx,
	MockETHtx__factory,
	FeeLogic__factory,
	WETH9__factory,
	SimpleGasPrice__factory,
	WETH9,
	FeeLogic,
	ERC20__factory,
} from '../../build/types/ethers-v5';
import { Contract } from 'ethers';

const contractName = 'ETHmxMinter';

const defaultGasPrice = parseGwei('200');
const ethmxMintParams: IETHmxMintParams = {
	earlyThreshold: parseEther('3000'),
	cCapNum: 10,
	cCapDen: 1,
	zetaFloorNum: 2,
	zetaFloorDen: 1,
	zetaCeilNum: 4,
	zetaCeilDen: 1,
};
const mintGasPrice = parseGwei('1000');
const feeRecipient = zeroPadAddress('0x1');
const feeNum = 75;
const feeDen = 1000;
const lpShareNumerator = 25;
const lpShareDenominator = 100;
const lpRecipient = zeroPadAddress('0x2');
const cTargetNum = 2;
const cTargetDen = 1;

function ethmxFromEth(
	totalGiven: BigNumber,
	amountETH: BigNumber,
	cRatio: { num: BigNumber; den: BigNumber },
	cTarget = { num: cTargetNum, den: cTargetDen },
	mp = ethmxMintParams,
): BigNumber {
	return ethmxFromEthOrig(totalGiven, amountETH, cRatio, cTarget, mp);
}

function calcFee(amount: BigNumber): BigNumber {
	return amount.mul(feeNum).div(feeDen);
}

function applyFee(amount: BigNumber): BigNumber {
	return amount.sub(calcFee(amount));
}

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: ETHmxMinter;
	contractImpl: ETHmxMinter;
	testerContract: ETHmxMinter;
	ethmx: ETHmx;
	ethtx: MockETHtx;
	ethtxAMM: ETHtxAMM;
	feeLogic: FeeLogic;
	weth: WETH9;
	sushiFactory: Contract;
	sushiRouter: Contract;
	uniFactory: Contract;
	uniRouter: Contract;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ deployments, getNamedAccounts, waffle }) => {
		const { deploy } = deployments;
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const feeLogic = await new FeeLogic__factory(deployerSigner).deploy(
			deployer,
			feeRecipient,
			feeNum,
			feeDen,
			[],
		);

		const oracle = await new SimpleGasPrice__factory(deployerSigner).deploy(
			defaultGasPrice,
		);

		const weth = await new WETH9__factory(deployerSigner).deploy();

		const ethtx = await new MockETHtx__factory(deployerSigner).deploy(
			deployer,
		);

		const ethtxAMM = await new ETHtxAMM__factory(deployerSigner).deploy(
			deployer,
		);
		await ethtxAMM.postInit({
			ethtx: ethtx.address,
			gasOracle: oracle.address,
			weth: weth.address,
			targetCRatioNum: cTargetNum,
			targetCRatioDen: cTargetDen,
		});
		await feeLogic.setExempt(ethtxAMM.address, true);

		const ethmx = await new ETHmx__factory(deployerSigner).deploy(deployer);

		const {
			factory: sushiFactory,
			router: sushiRouter,
		} = await sushiswapRouterFixture(deployer, weth.address);

		const {
			factory: uniFactory,
			router: uniRouter,
		} = await uniswapRouterFixture(deployer, weth.address);

		const result = await deploy('ETHmxMinterTest', {
			contract: 'ETHmxMinter',
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
		const contract = ETHmxMinter__factory.connect(
			result.address,
			deployerSigner,
		);
		await contract.postInit({
			ethmx: ethmx.address,
			ethtx: ethtx.address,
			ethtxAMM: ethtxAMM.address,
			weth: weth.address,
			ethmxMintParams,
			mintGasPrice,
			lpShareNumerator,
			lpShareDenominator,
			lps: [],
			lpRecipient,
		});

		const contractImpl = ETHmxMinter__factory.connect(
			(await deployments.get('ETHmxMinterTest_Implementation')).address,
			deployerSigner,
		);

		await feeLogic.setExemptBatch([
			{ account: contract.address, isExempt: true },
			{ account: sushiRouter.address, isExempt: true },
		]);
		await ethtx.postInit({
			feeLogic: feeLogic.address,
			minter: contract.address,
		});
		await ethmx.setMinter(contract.address);

		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			contractImpl,
			testerContract,
			ethmx,
			ethtx,
			ethtxAMM,
			feeLogic,
			weth,
			sushiFactory,
			sushiRouter,
			uniFactory,
			uniRouter,
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
			const {
				deployer,
				contract,
				contractImpl,
				ethmx,
				ethtx,
				ethtxAMM,
				weth,
			} = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);
			expect(
				await contractImpl.owner(),
				'implemenation owner address mismatch',
			).to.eq(deployer);

			expect(await contract.ethmx(), 'ETHmx address mismatch').to.eq(
				ethmx.address,
			);
			expect(await contract.ethtx(), 'ETHtx address mismatch').to.eq(
				ethtx.address,
			);
			expect(await contract.ethtxAMM(), 'ETHtxAMM address mismatch').to.eq(
				ethtxAMM.address,
			);
			expect(await contract.weth(), 'WETH address mismatch').to.eq(
				weth.address,
			);

			expect(await contract.mintGasPrice(), 'mintGasPrice mismatch').to.eq(
				mintGasPrice,
			);

			expect(await contract.totalGiven(), 'totalGiven mismatch').to.eq(0);

			const [
				earlyThreshold,
				cCapNum,
				cCapDen,
				zetaFloorNum,
				zetaFloorDen,
				zetaCeilNum,
				zetaCeilDen,
			] = await contract.ethmxMintParams();
			const mp = ethmxMintParams;
			expect(earlyThreshold, 'earlyThreshold mismatch').to.eq(
				mp.earlyThreshold,
			);
			expect(cCapNum, 'cCapNum mismatch').to.eq(mp.cCapNum);
			expect(cCapDen, 'cCapDen mismatch').to.eq(mp.cCapDen);
			expect(zetaFloorNum, 'zetaFloorNum mismatch').to.eq(mp.zetaFloorNum);
			expect(zetaFloorDen, 'zetaFloorDen mismatch').to.eq(mp.zetaFloorDen);
			expect(zetaCeilNum, 'zetaCeilNum mismatch').to.eq(mp.zetaCeilNum);
			expect(zetaCeilDen, 'zetaCeilDen mismatch').to.eq(mp.zetaCeilDen);

			const [lpShareNum, lpShareDen] = await contract.lpShare();
			expect(lpShareNum, 'lpShare numerator mismatch').to.eq(lpShareNumerator);
			expect(lpShareDen, 'lpShare denominator mismatch').to.eq(
				lpShareDenominator,
			);

			expect(await contract.lpRecipient(), 'lpRecipient mismatch').to.eq(
				lpRecipient,
			);

			expect(
				await contract.numLiquidityPools(),
				'numLiquidityPools mismatch',
			).to.eq(0);
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
					ethmx: zeroAddress,
					ethtx: zeroAddress,
					ethtxAMM: zeroAddress,
					weth: zeroAddress,
					ethmxMintParams,
					mintGasPrice: 0,
					lpShareNumerator: 0,
					lpShareDenominator: 0,
					lps: [],
					lpRecipient: zeroAddress,
				}),
			).to.be.revertedWith('caller is not the owner');
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

	describe('ethmxFromEth', function () {
		describe('should be correct', function () {
			describe('without early bonus', function () {
				const mp = {
					...ethmxMintParams,
					earlyThreshold: Zero,
				};
				const cTarget = { num: cTargetNum, den: cTargetDen };

				beforeEach(async function () {
					const { contract } = fixture;
					await contract.setEthmxMintParams(mp);
				});

				it('when liabilities == 0 (cRatio > cCap)', async function () {
					const { contract } = fixture;
					const amtEth = parseEther('1');
					const expected = amtEth.mul(mp.zetaFloorNum).div(mp.zetaFloorDen);
					expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
				});

				describe('when cRatioBefore < cTarget', function () {
					const collat = parseEther('10');
					const liabilityEthtx = ethToEthtx(defaultGasPrice, parseEther('20'));
					const liabilityEth = ethtxToEth(defaultGasPrice, liabilityEthtx);
					const customEthmxFromEth = (amountETH: BigNumber): BigNumber =>
						ethmxFromEth(
							Zero,
							amountETH,
							{
								num: collat,
								den: liabilityEth,
							},
							cTarget,
							mp,
						);

					beforeEach(async function () {
						const { ethtxAMM, ethtx, tester, weth } = fixture;

						await sendWETH(weth, ethtxAMM.address, collat);
						await ethtx.mockMint(tester, liabilityEthtx);
					});

					it('and amountIn == 1wei', async function () {
						const { contract } = fixture;
						const amtEth = One;
						const expected = amtEth.mul(mp.zetaCeilNum).div(mp.zetaCeilDen);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});

					it('and cRatioAfter < cTarget', async function () {
						const { contract } = fixture;
						const amtEth = parseEther('1');
						const expected = amtEth.mul(mp.zetaCeilNum).div(mp.zetaCeilDen);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});

					it('and cRatioAfter == cTarget', async function () {
						const { contract, ethtxAMM } = fixture;
						const amtEth = parseEther('30').sub(2);
						expect(await ethtxAMM.ethNeeded(), 'ethNeeded mismatch').to.eq(
							amtEth,
						);
						const expected = amtEth.mul(mp.zetaCeilNum).div(mp.zetaCeilDen);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});

					it('and cRatioAfter > cTarget', async function () {
						const { contract } = fixture;
						const amtEth = parseEther('35');
						const expected = parseEther('139.84375');
						expect(customEthmxFromEth(amtEth), 'ts impl mismatch').to.eq(
							expected,
						);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});

					it('and cRatioAfter == cCap', async function () {
						const { contract } = fixture;
						const amtEth = parseEther('190').sub(10);
						const expected = parseEther('600').sub(32);
						expect(amtEth.add(collat)).to.eq(
							liabilityEth.mul(mp.cCapNum).div(mp.cCapDen),
							'capEth mismatch',
						);
						expect(customEthmxFromEth(amtEth), 'ts impl mismatch').to.eq(
							expected,
						);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});

					it('and cRatioAfter > cCap', async function () {
						const { contract } = fixture;
						const amtEth = parseEther('220');
						const expected = parseEther('660').sub(12);
						expect(customEthmxFromEth(amtEth), 'ts impl mismatch').to.eq(
							expected,
						);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});
				});

				describe('when cTarget == cRatioBefore', function () {
					const liabilityEthtx = ethToEthtx(defaultGasPrice, parseEther('20'));
					const liabilityEth = ethtxToEth(defaultGasPrice, liabilityEthtx);
					const collat = liabilityEth.mul(cTarget.num).div(cTarget.den);
					const customEthmxFromEth = (amountETH: BigNumber): BigNumber =>
						ethmxFromEth(
							Zero,
							amountETH,
							{
								num: collat,
								den: liabilityEth,
							},
							cTarget,
							mp,
						);

					beforeEach(async function () {
						const { ethtxAMM, ethtx, tester, weth } = fixture;

						await sendWETH(weth, ethtxAMM.address, collat);
						await ethtx.mockMint(tester, liabilityEthtx);
					});

					it('with amountIn == 1wei', async function () {
						const { contract } = fixture;
						const amtEth = One;
						const expected = 4;
						expect(customEthmxFromEth(amtEth), 'ts impl mismatch').to.eq(
							expected,
						);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});

					it('and cRatioAfter < cCap', async function () {
						const { contract } = fixture;
						const amtEth = parseEther('10');
						const expected = parseEther('39.375');
						expect(customEthmxFromEth(amtEth), 'ts impl mismatch').to.eq(
							expected,
						);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});

					it('and cRatioAfter == cCap', async function () {
						const { contract } = fixture;
						const amtEth = liabilityEth
							.mul(mp.cCapNum)
							.div(mp.cCapDen)
							.sub(collat);
						const expected = parseEther('480').sub(24);
						expect(customEthmxFromEth(amtEth), 'ts impl mismatch').to.eq(
							expected,
						);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});

					it('and cRatioAfter > cCap', async function () {
						const { contract } = fixture;
						const amtEth = liabilityEth
							.mul(mp.cCapNum)
							.div(mp.cCapDen)
							.sub(collat)
							.add(parseEther('5'))
							.add(12);
						const expected = parseEther('490');
						expect(customEthmxFromEth(amtEth), 'ts impl mismatch').to.eq(
							expected,
						);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});
				});

				describe('when cTarget < cRatioBefore < cCap', function () {
					const liabilityEthtx = ethToEthtx(defaultGasPrice, parseEther('20'));
					const liabilityEth = ethtxToEth(defaultGasPrice, liabilityEthtx);
					const collat = liabilityEth
						.mul(cTarget.num)
						.div(cTarget.den)
						.add(parseEther('80'));
					const customEthmxFromEth = (amountETH: BigNumber): BigNumber =>
						ethmxFromEth(
							Zero,
							amountETH,
							{
								num: collat,
								den: liabilityEth,
							},
							cTarget,
							mp,
						);

					beforeEach(async function () {
						const { ethtxAMM, ethtx, tester, weth } = fixture;

						await sendWETH(weth, ethtxAMM.address, collat);
						await ethtx.mockMint(tester, liabilityEthtx);
					});

					it('with amountIn == 1wei', async function () {
						const { contract } = fixture;
						const amtEth = One;
						const expected = 3;
						expect(customEthmxFromEth(amtEth), 'ts impl mismatch').to.eq(
							expected,
						);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});

					it('and cRatioAfter < cCap', async function () {
						const { contract } = fixture;
						const amtEth = parseEther('5');
						const expected = parseEther('14.84375');
						expect(customEthmxFromEth(amtEth), 'ts impl mismatch').to.eq(
							expected,
						);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});

					it('and cRatioAfter == cCap', async function () {
						const { contract } = fixture;
						const amtEth = liabilityEth
							.mul(mp.cCapNum)
							.div(mp.cCapDen)
							.sub(collat);
						const expected = parseEther('200').sub(21);
						expect(customEthmxFromEth(amtEth), 'ts impl mismatch').to.eq(
							expected,
						);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});

					it('and cRatioAfter > cCap', async function () {
						const { contract } = fixture;
						const amtEth = liabilityEth
							.mul(mp.cCapNum)
							.div(mp.cCapDen)
							.sub(collat)
							.add(parseEther('5'))
							.add(10);
						const expected = parseEther('210').sub(1);
						expect(customEthmxFromEth(amtEth), 'ts impl mismatch').to.eq(
							expected,
						);
						expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
					});
				});

				it('when cRatioBefore == cCap', async function () {
					const { contract } = fixture;
					const liabilityEthtx = ethToEthtx(defaultGasPrice, parseEther('20'));
					const liabilityEth = ethtxToEth(defaultGasPrice, liabilityEthtx);
					const collat = liabilityEth.mul(mp.cCapNum).div(mp.cCapDen);

					const amtEth = parseEther('5');
					const expected = parseEther('10');
					expect(
						ethmxFromEth(
							Zero,
							amtEth,
							{
								num: collat,
								den: liabilityEth,
							},
							cTarget,
							mp,
						),
						'ts impl mismatch',
					).to.eq(expected);

					expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
				});

				it('when cRatioBefore > cCap', async function () {
					const { contract } = fixture;
					const liabilityEthtx = ethToEthtx(defaultGasPrice, parseEther('20'));
					const liabilityEth = ethtxToEth(defaultGasPrice, liabilityEthtx);
					const collat = liabilityEth
						.mul(mp.cCapNum)
						.div(mp.cCapDen)
						.add('50');

					const amtEth = parseEther('5');
					const expected = parseEther('10');
					expect(
						ethmxFromEth(
							Zero,
							amtEth,
							{
								num: collat,
								den: liabilityEth,
							},
							cTarget,
							mp,
						),
						'ts impl mismatch',
					).to.eq(expected);

					expect(await contract.ethmxFromEth(amtEth)).to.eq(expected);
				});
			});

			describe('with early bonus', function () {
				it('when amountIn == 1wei', async function () {
					const { contract } = fixture;

					const amount = One;
					const expected = BigNumber.from(4);
					expect(
						ethmxFromEth(Zero, amount, {
							num: Zero,
							den: Zero,
						}),
						'ts impl mismatch',
					).to.eq(expected);

					expect(await contract.ethmxFromEth(amount)).to.eq(expected);
				});

				it('when totalGiven == 0', async function () {
					const { contract } = fixture;

					const amount = parseEther('10');
					const expected = parseUnits('39966666666666666667', 'wei');
					expect(
						ethmxFromEth(Zero, amount, {
							num: Zero,
							den: Zero,
						}),
						'ts impl mismatch',
					).to.eq(expected);

					expect(await contract.ethmxFromEth(amount)).to.eq(expected);
				});

				it('when totalGiven == earlyThreshold / 4', async function () {
					const { contract } = fixture;

					const ethGiven = ethmxMintParams.earlyThreshold.div(4);
					await contract.mint({ value: ethGiven });

					const amount = parseEther('10');
					const expected = parseUnits('34966666666666666667', 'wei');
					expect(
						ethmxFromEth(ethGiven, amount, {
							num: Zero,
							den: Zero,
						}),
						'ts impl mismatch',
					).to.eq(expected);

					expect(await contract.ethmxFromEth(amount)).to.eq(expected);
				});

				it('when totalGiven == earlyThreshold / 2', async function () {
					const { contract } = fixture;

					const ethGiven = ethmxMintParams.earlyThreshold.div(2);
					await contract.mint({ value: ethGiven });

					const amount = parseEther('10');
					const expected = parseUnits('29966666666666666667', 'wei');
					expect(
						ethmxFromEth(ethGiven, amount, {
							num: Zero,
							den: Zero,
						}),
						'ts impl mismatch',
					).to.eq(expected);

					expect(await contract.ethmxFromEth(amount)).to.eq(expected);
				});

				it('when totalGiven == earlyThreshold * 3 / 4', async function () {
					const { contract } = fixture;

					const ethGiven = ethmxMintParams.earlyThreshold.mul(3).div(4);
					await contract.mint({ value: ethGiven });

					const amount = parseEther('10');
					const expected = parseUnits('24966666666666666667', 'wei');
					expect(
						ethmxFromEth(ethGiven, amount, {
							num: Zero,
							den: Zero,
						}),
						'ts impl mismatch',
					).to.eq(expected);

					expect(await contract.ethmxFromEth(amount)).to.eq(expected);
				});

				it('when totalGiven == earlyThreshold', async function () {
					const { contract } = fixture;

					const ethGiven = ethmxMintParams.earlyThreshold;
					await contract.mint({ value: ethGiven });

					const amount = parseEther('10');
					const expected = parseEther('20');
					expect(
						ethmxFromEth(ethGiven, amount, {
							num: Zero,
							den: Zero,
						}),
						'ts impl mismatch',
					).to.eq(expected);

					expect(await contract.ethmxFromEth(amount)).to.eq(expected);
				});

				it('when totalGiven > earlyThreshold', async function () {
					const { contract } = fixture;

					const ethGiven = ethmxMintParams.earlyThreshold.add(1);
					await contract.mint({ value: ethGiven });

					const amount = parseEther('10');
					const expected = parseEther('20');
					expect(
						ethmxFromEth(ethGiven, amount, {
							num: Zero,
							den: Zero,
						}),
						'ts impl mismatch',
					).to.eq(expected);

					expect(await contract.ethmxFromEth(amount)).to.eq(expected);
				});

				it('when amountEthIn > earlyThreshold - totalGiven', async function () {
					const { contract } = fixture;

					const amount = parseEther('10');
					const ethGiven = ethmxMintParams.earlyThreshold.sub(amount.div(2));
					await contract.mint({ value: ethGiven });

					const expected = parseUnits('20008333333333333333', 'wei');
					expect(
						ethmxFromEth(ethGiven, amount, {
							num: Zero,
							den: Zero,
						}),
						'ts impl mismatch',
					).to.eq(expected);

					expect(await contract.ethmxFromEth(amount)).to.eq(expected);
				});
			});
		});
	});

	describe('ethmxFromEthtx', function () {
		it('should be  correct', async function () {
			const { contract, ethtxAMM } = fixture;

			const amountEthtx = parseETHtx('10000');
			const amountEth = await ethtxAMM.ethToExactEthtx(amountEthtx);

			expect(await contract.ethmxFromEthtx(amountEthtx)).to.eq(amountEth);
		});
	});

	describe('ethtxFromEth', function () {
		it('should be correct', async function () {
			const { contract, ethtxAMM } = fixture;

			const amount = parseEther('10');
			const num = amount.mul(parseUnits('1', 18));
			const den = mintGasPrice.mul(await ethtxAMM.gasPerETHtx());
			const expected = num.div(den);

			expect(await contract.ethtxFromEth(amount)).to.eq(expected);
		});

		it('should change with mintGasPrice', async function () {
			const { contract, ethtxAMM } = fixture;

			const newMintPrice = parseGwei('600');
			expect(newMintPrice).to.not.eq(mintGasPrice);

			await contract.setMintGasPrice(newMintPrice);

			const amount = parseEther('10');
			const num = amount.mul(parseUnits('1', 18));
			const den = newMintPrice.mul(await ethtxAMM.gasPerETHtx());
			const expected = num.div(den);

			expect(await contract.ethtxFromEth(amount)).to.eq(expected);
		});
	});

	describe('addLp', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.addLp(zeroAddress)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should revert if the liquidity pool was already added', async function () {
			const { contract } = fixture;
			const address = zeroPadAddress('0x1');
			await contract.addLp(address);
			await expect(contract.addLp(address)).to.be.revertedWith(
				'liquidity pool already added',
			);
		});

		it('should update numLiquidityPools', async function () {
			const { contract } = fixture;
			const address = zeroPadAddress('0x1');
			await contract.addLp(address);
			expect(await contract.numLiquidityPools()).to.eq(1);
		});

		it('should update liquidityPoolsAt', async function () {
			const { contract } = fixture;
			const address = zeroPadAddress('0x1');
			await contract.addLp(address);
			expect(await contract.liquidityPoolsAt(0)).to.eq(address);
		});

		it('should emit LpAdded event', async function () {
			const { contract, deployer } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(contract.addLp(address))
				.to.emit(contract, 'LpAdded')
				.withArgs(deployer, address);
		});
	});

	describe('mint', function () {
		const amount = parseEther('10');

		describe('should mint', function () {
			beforeEach(async function () {
				const { contract } = fixture;
				await contract.mint({ value: amount });
			});

			it('and wrap and transfer correct WETH amount', async function () {
				const { ethtxAMM, weth } = fixture;
				expect(await weth.balanceOf(ethtxAMM.address)).to.eq(amount);
			});

			it('correct ETHtx amount', async function () {
				const { contract, ethtxAMM } = fixture;
				const expected = await contract.ethtxFromEth(amount);
				expect(await ethtxAMM.ethtxAvailable()).to.eq(expected);
			});

			it('correct ETHmx amount', async function () {
				const { deployer, ethmx } = fixture;
				const expected = ethmxFromEth(Zero, amount, { num: Zero, den: Zero });
				expect(await ethmx.balanceOf(deployer)).to.eq(expected);
			});

			it('and increase totalGiven', async function () {
				const { contract } = fixture;
				expect(await contract.totalGiven()).to.eq(amount);
			});
		});

		describe('should mint with one LP target', function () {
			const amountEthtx = ethToEthtx(mintGasPrice, amount);
			const ethtxToLp = amountEthtx
				.mul(lpShareNumerator)
				.div(lpShareDenominator);
			const ethToLp = ethtxToEth(defaultGasPrice, ethtxToLp);

			beforeEach(async function () {
				const { contract, uniRouter } = fixture;
				await contract.addLp(uniRouter.address);
				await contract.mint({ value: amount });
			});

			it('and wrap and transfer correct WETH amount to AMM', async function () {
				const { ethtxAMM, weth } = fixture;
				expect(await weth.balanceOf(ethtxAMM.address)).to.eq(
					amount.sub(ethToLp),
				);
			});

			it('and wrap and transfer correct WETH amount to LP', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pair = await uniFactory.getPair(ethtx.address, weth.address);
				expect(await weth.balanceOf(pair)).to.eq(ethToLp);
			});

			it('correct ETHtx amount to AMM', async function () {
				const { ethtxAMM } = fixture;
				const expected = amountEthtx.sub(ethtxToLp);
				expect(await ethtxAMM.ethtxAvailable()).to.eq(expected);
			});

			it('correct ETHtx amount to LP', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pair = await uniFactory.getPair(ethtx.address, weth.address);
				expect(await ethtx.balanceOf(pair)).to.eq(ethtxToLp);
			});

			it('sent LP to lpRecipient', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pairAddr = await uniFactory.getPair(ethtx.address, weth.address);
				const pair = ERC20__factory.connect(pairAddr, ethtx.signer);
				expect(await pair.balanceOf(lpRecipient)).to.not.eq(0);
			});

			it('correct ETHmx amount to sender', async function () {
				const { deployer, ethmx } = fixture;
				const expected = ethmxFromEth(Zero, amount, { num: Zero, den: Zero });
				expect(await ethmx.balanceOf(deployer)).to.eq(expected);
			});

			it('and increase totalGiven', async function () {
				const { contract } = fixture;
				expect(await contract.totalGiven()).to.eq(amount);
			});
		});

		describe('should mint with one LP target and different price', function () {
			const amountEthtx = ethToEthtx(mintGasPrice, amount);
			const reserveEth = amount;
			const reserveEthtxBeforeFee = amountEthtx.div(2);
			const reserveEthtx = applyFee(reserveEthtxBeforeFee);
			const ethToLp = ethtxToEth(
				defaultGasPrice,
				amountEthtx.mul(lpShareNumerator).div(lpShareDenominator),
			);
			const ethtxToLp = ethToLp.mul(reserveEthtx).div(reserveEth);

			beforeEach(async function () {
				const { contract, deployer, ethtx, sushiRouter, weth } = fixture;

				await contract.addLp(sushiRouter.address);

				await weth.deposit({ value: reserveEth });
				await ethtx.mockMint(deployer, reserveEthtxBeforeFee);

				await weth.approve(sushiRouter.address, reserveEth);
				await ethtx.increaseAllowance(
					sushiRouter.address,
					reserveEthtxBeforeFee,
				);

				await sushiRouter.addLiquidity(
					ethtx.address,
					weth.address,
					reserveEthtxBeforeFee,
					reserveEth,
					0,
					0,
					deployer,
					MaxUint256,
				);

				await contract.mint({ value: amount });
			});

			it('and wrap and transfer correct WETH amount to AMM', async function () {
				const { ethtxAMM, weth } = fixture;
				expect(await weth.balanceOf(ethtxAMM.address)).to.eq(
					amount.sub(ethToLp),
				);
			});

			it('and wrap and transfer correct WETH amount to LP', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pair = await sushiFactory.getPair(ethtx.address, weth.address);
				expect(await weth.balanceOf(pair)).to.eq(reserveEth.add(ethToLp));
			});

			it('correct ETHtx amount to AMM', async function () {
				const { ethtxAMM } = fixture;
				const expected = amountEthtx.sub(ethtxToLp);
				expect(await ethtxAMM.ethtxAvailable()).to.eq(expected);
			});

			it('correct ETHtx amount to LP', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pair = await sushiFactory.getPair(ethtx.address, weth.address);
				expect(await ethtx.balanceOf(pair)).to.eq(reserveEthtx.add(ethtxToLp));
			});

			it('sent LP to lpRecipient', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pairAddr = await sushiFactory.getPair(
					ethtx.address,
					weth.address,
				);
				const pair = ERC20__factory.connect(pairAddr, ethtx.signer);
				expect(await pair.balanceOf(lpRecipient)).to.not.eq(0);
			});

			it('correct ETHmx amount to sender', async function () {
				const { deployer, ethmx, ethtxAMM } = fixture;
				const [collat, liability] = await ethtxAMM.cRatio();
				const expected = ethmxFromEth(Zero, amount, {
					num: collat,
					den: liability,
				});
				expect(await ethmx.balanceOf(deployer)).to.eq(expected);
			});

			it('and increase totalGiven', async function () {
				const { contract } = fixture;
				expect(await contract.totalGiven()).to.eq(amount);
			});
		});

		describe('should mint with multiple LP targets', function () {
			const amountEthtx = ethToEthtx(mintGasPrice, amount);
			const ethtxToLp = amountEthtx
				.mul(lpShareNumerator)
				.div(lpShareDenominator)
				.div(2);
			const ethToLp = ethtxToEth(defaultGasPrice, ethtxToLp);

			beforeEach(async function () {
				const { contract, sushiRouter, uniRouter } = fixture;
				await contract.addLp(uniRouter.address);
				await contract.addLp(sushiRouter.address);
				await contract.mint({ value: amount });
			});

			it('and wrap and transfer correct WETH amount to AMM', async function () {
				const { ethtxAMM, weth } = fixture;
				expect(await weth.balanceOf(ethtxAMM.address)).to.eq(
					amount.sub(ethToLp.mul(2)),
				);
			});

			it('and wrap and transfer correct WETH amount to Sushi LP', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pair = await sushiFactory.getPair(ethtx.address, weth.address);
				expect(await weth.balanceOf(pair)).to.eq(ethToLp);
			});

			it('and wrap and transfer correct WETH amount to UNI LP', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pair = await uniFactory.getPair(ethtx.address, weth.address);
				expect(await weth.balanceOf(pair)).to.eq(ethToLp);
			});

			it('correct ETHtx amount to AMM', async function () {
				const { ethtxAMM } = fixture;
				const expected = amountEthtx.sub(ethtxToLp.mul(2));
				expect(await ethtxAMM.ethtxAvailable()).to.eq(expected);
			});

			it('correct ETHtx amount to Sushi LP', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pair = await sushiFactory.getPair(ethtx.address, weth.address);
				expect(await ethtx.balanceOf(pair)).to.eq(ethtxToLp);
			});

			it('correct ETHtx amount to UNI LP', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pair = await uniFactory.getPair(ethtx.address, weth.address);
				expect(await ethtx.balanceOf(pair)).to.eq(ethtxToLp);
			});

			it('sent Sushi LP to lpRecipient', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pairAddr = await sushiFactory.getPair(
					ethtx.address,
					weth.address,
				);
				const pair = ERC20__factory.connect(pairAddr, ethtx.signer);
				expect(await pair.balanceOf(lpRecipient)).to.not.eq(0);
			});

			it('sent UNI LP to lpRecipient', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pairAddr = await uniFactory.getPair(ethtx.address, weth.address);
				const pair = ERC20__factory.connect(pairAddr, ethtx.signer);
				expect(await pair.balanceOf(lpRecipient)).to.not.eq(0);
			});

			it('correct ETHmx amount to sender', async function () {
				const { deployer, ethmx } = fixture;
				const expected = ethmxFromEth(Zero, amount, { num: Zero, den: Zero });
				expect(await ethmx.balanceOf(deployer)).to.eq(expected);
			});

			it('and increase totalGiven', async function () {
				const { contract } = fixture;
				expect(await contract.totalGiven()).to.eq(amount);
			});
		});

		it('should revert when sent is zero', async function () {
			const { contract } = fixture;
			await expect(contract.mint({ value: 0 })).to.be.revertedWith(
				'cannot mint with zero amount',
			);
		});

		it('should revert when paused', async function () {
			const { contract } = fixture;
			await contract.pause();
			await expect(contract.mint({ value: amount })).to.be.revertedWith(
				'paused',
			);
		});
	});

	describe('mintWithETHtx', function () {
		const amount = parseETHtx('10000');

		beforeEach(async function () {
			const { deployer, ethtx } = fixture;
			await ethtx.mockMint(deployer, amount);
		});

		it('should burn correct ETHtx amount from sender', async function () {
			const { contract, deployer, ethtx } = fixture;

			await expect(contract.mintWithETHtx(amount), 'event mismatch')
				.to.emit(ethtx, 'Transfer')
				.withArgs(deployer, zeroAddress, amount);

			expect(await ethtx.balanceOf(deployer), 'balance mismatch').to.eq(0);
			expect(await ethtx.totalSupply(), 'totalSupply mismatch').to.eq(0);
		});

		it('should mint correct ETHmx amount', async function () {
			const { contract, deployer, ethmx } = fixture;
			const amountETHmx = await contract.ethmxFromEthtx(amount);

			await expect(contract.mintWithETHtx(amount), 'event mismatch')
				.to.emit(ethmx, 'Transfer')
				.withArgs(zeroAddress, deployer, amountETHmx);

			expect(await ethmx.balanceOf(deployer), 'balance mismatch').to.eq(
				amountETHmx,
			);
			expect(await ethmx.totalSupply(), 'totalSupply mismatch').to.eq(
				amountETHmx,
			);
		});

		it('should mint zero when amount is 238', async function () {
			const { contract, deployer, ethmx } = fixture;

			await expect(contract.mintWithETHtx(238))
				.to.emit(ethmx, 'Transfer')
				.withArgs(zeroAddress, deployer, 0);
		});

		it('should mint 1 when amount is 239', async function () {
			const { contract, deployer, ethmx } = fixture;

			await expect(contract.mintWithETHtx(239))
				.to.emit(ethmx, 'Transfer')
				.withArgs(zeroAddress, deployer, 1);
		});

		it('should succeed when amount meets needed collateral', async function () {
			const { contract, deployer, deployerSigner, ethmx, ethtxAMM } = fixture;

			const [targetNum, targetDen] = await ethtxAMM.targetCRatio();
			const amountETH = (await ethtxAMM.ethToExactEthtx(amount))
				.mul(targetNum)
				.div(targetDen)
				.sub(1);

			await deployerSigner.sendTransaction({
				to: ethtxAMM.address,
				value: amountETH,
			});

			// const amountETHmx = await contract.ethmxFromEthtx(1);
			await expect(contract.mintWithETHtx(239))
				.to.emit(ethmx, 'Transfer')
				.withArgs(zeroAddress, deployer, 1);
		});

		it('should succeed when amount meets needed collateral plus 237', async function () {
			const { contract, deployer, deployerSigner, ethmx, ethtxAMM } = fixture;

			const [targetNum, targetDen] = await ethtxAMM.targetCRatio();
			const amountETH = (await ethtxAMM.ethToExactEthtx(amount))
				.mul(targetNum)
				.div(targetDen)
				.sub(1);

			await deployerSigner.sendTransaction({
				to: ethtxAMM.address,
				value: amountETH,
			});

			// const amountETHmx = await contract.ethmxFromEthtx(1);
			await expect(contract.mintWithETHtx(239 + 237))
				.to.emit(ethmx, 'Transfer')
				.withArgs(zeroAddress, deployer, 1);
		});

		it('should revert when amount exceeds needed collateral', async function () {
			const { contract, deployerSigner, ethtxAMM } = fixture;

			const [targetNum, targetDen] = await ethtxAMM.targetCRatio();
			const amountETH = (await ethtxAMM.ethToExactEthtx(amount))
				.mul(targetNum)
				.div(targetDen)
				.sub(1);

			await deployerSigner.sendTransaction({
				to: ethtxAMM.address,
				value: amountETH,
			});

			await expect(contract.mintWithETHtx(239 + 238)).to.be.revertedWith(
				'ETHtx value burnt exceeds ETH needed',
			);
		});

		it('should revert when collateral is not needed', async function () {
			const { contract, deployerSigner, ethtxAMM } = fixture;

			const [targetNum, targetDen] = await ethtxAMM.targetCRatio();
			const amountETH = (await ethtxAMM.ethToExactEthtx(amount))
				.mul(targetNum)
				.div(targetDen);

			await deployerSigner.sendTransaction({
				to: ethtxAMM.address,
				value: amountETH,
			});

			await expect(contract.mintWithETHtx(239)).to.be.revertedWith(
				'ETHtx value burnt exceeds ETH needed',
			);
		});

		it('should revert when amount is zero', async function () {
			const { contract } = fixture;
			await expect(contract.mintWithETHtx(0)).to.be.revertedWith(
				'cannot mint with zero amount',
			);
		});

		it('should revert when paused', async function () {
			const { contract } = fixture;
			await contract.pause();
			await expect(contract.mintWithETHtx(amount)).to.be.revertedWith(
				'paused',
			);
		});
	});

	describe('mintWithWETH', function () {
		const amount = parseEther('10');

		describe('should mint', function () {
			beforeEach(async function () {
				const { contract, weth } = fixture;
				await weth.deposit({ value: amount });
				await weth.approve(contract.address, amount);
				await contract.mintWithWETH(amount);
			});

			it('and transfer correct WETH amount', async function () {
				const { ethtxAMM, weth } = fixture;
				expect(await weth.balanceOf(ethtxAMM.address)).to.eq(amount);
			});

			it('correct ETHtx amount', async function () {
				const { contract, ethtxAMM } = fixture;
				const expected = await contract.ethtxFromEth(amount);
				expect(await ethtxAMM.ethtxAvailable()).to.eq(expected);
			});

			it('correct ETHmx amount', async function () {
				const { deployer, ethmx } = fixture;
				const expected = ethmxFromEth(Zero, amount, { num: Zero, den: Zero });
				expect(await ethmx.balanceOf(deployer)).to.eq(expected);
			});

			it('and increase totalGiven', async function () {
				const { contract } = fixture;
				expect(await contract.totalGiven()).to.eq(amount);
			});
		});

		describe('should mint with one LP target', function () {
			const amountEthtx = ethToEthtx(mintGasPrice, amount);
			const ethtxToLp = amountEthtx
				.mul(lpShareNumerator)
				.div(lpShareDenominator);
			const ethToLp = ethtxToEth(defaultGasPrice, ethtxToLp);

			beforeEach(async function () {
				const { contract, uniRouter, weth } = fixture;

				await contract.addLp(uniRouter.address);

				await weth.deposit({ value: amount });
				await weth.approve(contract.address, amount);
				await contract.mintWithWETH(amount);
			});

			it('and wrap and transfer correct WETH amount to AMM', async function () {
				const { ethtxAMM, weth } = fixture;
				expect(await weth.balanceOf(ethtxAMM.address)).to.eq(
					amount.sub(ethToLp),
				);
			});

			it('and wrap and transfer correct WETH amount to LP', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pair = await uniFactory.getPair(ethtx.address, weth.address);
				expect(await weth.balanceOf(pair)).to.eq(ethToLp);
			});

			it('correct ETHtx amount to AMM', async function () {
				const { ethtxAMM } = fixture;
				const expected = amountEthtx.sub(ethtxToLp);
				expect(await ethtxAMM.ethtxAvailable()).to.eq(expected);
			});

			it('correct ETHtx amount to LP', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pair = await uniFactory.getPair(ethtx.address, weth.address);
				expect(await ethtx.balanceOf(pair)).to.eq(ethtxToLp);
			});

			it('sent LP to lpRecipient', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pairAddr = await uniFactory.getPair(ethtx.address, weth.address);
				const pair = ERC20__factory.connect(pairAddr, ethtx.signer);
				expect(await pair.balanceOf(lpRecipient)).to.not.eq(0);
			});

			it('correct ETHmx amount to sender', async function () {
				const { deployer, ethmx } = fixture;
				const expected = ethmxFromEth(Zero, amount, { num: Zero, den: Zero });
				expect(await ethmx.balanceOf(deployer)).to.eq(expected);
			});

			it('and increase totalGiven', async function () {
				const { contract } = fixture;
				expect(await contract.totalGiven()).to.eq(amount);
			});
		});

		describe('should mint with one LP target and different price', function () {
			const amountEthtx = ethToEthtx(mintGasPrice, amount);
			const reserveEth = amount;
			const reserveEthtxBeforeFee = amountEthtx.div(2);
			const reserveEthtx = applyFee(reserveEthtxBeforeFee);
			const ethToLp = ethtxToEth(
				defaultGasPrice,
				amountEthtx.mul(lpShareNumerator).div(lpShareDenominator),
			);
			const ethtxToLp = ethToLp.mul(reserveEthtx).div(reserveEth);

			beforeEach(async function () {
				const { contract, deployer, ethtx, sushiRouter, weth } = fixture;

				await contract.addLp(sushiRouter.address);

				await weth.deposit({ value: reserveEth.add(amount) });
				await ethtx.mockMint(deployer, reserveEthtxBeforeFee);

				await weth.approve(sushiRouter.address, reserveEth);
				await ethtx.increaseAllowance(
					sushiRouter.address,
					reserveEthtxBeforeFee,
				);

				await sushiRouter.addLiquidity(
					ethtx.address,
					weth.address,
					reserveEthtxBeforeFee,
					reserveEth,
					0,
					0,
					deployer,
					MaxUint256,
				);

				await weth.approve(contract.address, amount);
				await contract.mintWithWETH(amount);
			});

			it('and wrap and transfer correct WETH amount to AMM', async function () {
				const { ethtxAMM, weth } = fixture;
				expect(await weth.balanceOf(ethtxAMM.address)).to.eq(
					amount.sub(ethToLp),
				);
			});

			it('and wrap and transfer correct WETH amount to LP', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pair = await sushiFactory.getPair(ethtx.address, weth.address);
				expect(await weth.balanceOf(pair)).to.eq(reserveEth.add(ethToLp));
			});

			it('correct ETHtx amount to AMM', async function () {
				const { ethtxAMM } = fixture;
				const expected = amountEthtx.sub(ethtxToLp);
				expect(await ethtxAMM.ethtxAvailable()).to.eq(expected);
			});

			it('correct ETHtx amount to LP', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pair = await sushiFactory.getPair(ethtx.address, weth.address);
				expect(await ethtx.balanceOf(pair)).to.eq(reserveEthtx.add(ethtxToLp));
			});

			it('sent LP to lpRecipient', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pairAddr = await sushiFactory.getPair(
					ethtx.address,
					weth.address,
				);
				const pair = ERC20__factory.connect(pairAddr, ethtx.signer);
				expect(await pair.balanceOf(lpRecipient)).to.not.eq(0);
			});

			it('correct ETHmx amount to sender', async function () {
				const { deployer, ethmx, ethtxAMM } = fixture;
				const [collat, liability] = await ethtxAMM.cRatio();
				const expected = ethmxFromEth(Zero, amount, {
					num: collat,
					den: liability,
				});
				expect(await ethmx.balanceOf(deployer)).to.eq(expected);
			});

			it('and increase totalGiven', async function () {
				const { contract } = fixture;
				expect(await contract.totalGiven()).to.eq(amount);
			});
		});

		describe('should mint with multiple LP targets', function () {
			const amountEthtx = ethToEthtx(mintGasPrice, amount);
			const ethtxToLp = amountEthtx
				.mul(lpShareNumerator)
				.div(lpShareDenominator)
				.div(2);
			const ethToLp = ethtxToEth(defaultGasPrice, ethtxToLp);

			beforeEach(async function () {
				const { contract, sushiRouter, uniRouter, weth } = fixture;
				await contract.addLp(uniRouter.address);
				await contract.addLp(sushiRouter.address);

				await weth.deposit({ value: amount });
				await weth.approve(contract.address, amount);
				await contract.mintWithWETH(amount);
			});

			it('and wrap and transfer correct WETH amount to AMM', async function () {
				const { ethtxAMM, weth } = fixture;
				expect(await weth.balanceOf(ethtxAMM.address)).to.eq(
					amount.sub(ethToLp.mul(2)),
				);
			});

			it('and wrap and transfer correct WETH amount to Sushi LP', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pair = await sushiFactory.getPair(ethtx.address, weth.address);
				expect(await weth.balanceOf(pair)).to.eq(ethToLp);
			});

			it('and wrap and transfer correct WETH amount to UNI LP', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pair = await uniFactory.getPair(ethtx.address, weth.address);
				expect(await weth.balanceOf(pair)).to.eq(ethToLp);
			});

			it('correct ETHtx amount to AMM', async function () {
				const { ethtxAMM } = fixture;
				const expected = amountEthtx.sub(ethtxToLp.mul(2));
				expect(await ethtxAMM.ethtxAvailable()).to.eq(expected);
			});

			it('correct ETHtx amount to Sushi LP', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pair = await sushiFactory.getPair(ethtx.address, weth.address);
				expect(await ethtx.balanceOf(pair)).to.eq(ethtxToLp);
			});

			it('correct ETHtx amount to UNI LP', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pair = await uniFactory.getPair(ethtx.address, weth.address);
				expect(await ethtx.balanceOf(pair)).to.eq(ethtxToLp);
			});

			it('sent Sushi LP to lpRecipient', async function () {
				const { ethtx, sushiFactory, weth } = fixture;
				const pairAddr = await sushiFactory.getPair(
					ethtx.address,
					weth.address,
				);
				const pair = ERC20__factory.connect(pairAddr, ethtx.signer);
				expect(await pair.balanceOf(lpRecipient)).to.not.eq(0);
			});

			it('sent UNI LP to lpRecipient', async function () {
				const { ethtx, uniFactory, weth } = fixture;
				const pairAddr = await uniFactory.getPair(ethtx.address, weth.address);
				const pair = ERC20__factory.connect(pairAddr, ethtx.signer);
				expect(await pair.balanceOf(lpRecipient)).to.not.eq(0);
			});

			it('correct ETHmx amount to sender', async function () {
				const { deployer, ethmx } = fixture;
				const expected = ethmxFromEth(Zero, amount, { num: Zero, den: Zero });
				expect(await ethmx.balanceOf(deployer)).to.eq(expected);
			});

			it('and increase totalGiven', async function () {
				const { contract } = fixture;
				expect(await contract.totalGiven()).to.eq(amount);
			});
		});

		it('should revert when amount is zero', async function () {
			const { contract } = fixture;
			await expect(contract.mintWithWETH(0)).to.be.revertedWith(
				'cannot mint with zero amount',
			);
		});

		it('should revert when paused', async function () {
			const { contract, weth } = fixture;
			await contract.pause();
			await weth.deposit({ value: amount });
			await expect(contract.mintWithWETH(amount)).to.be.revertedWith('paused');
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
		it('should fail to recover nonexistent token', async function () {
			const { contract, deployer, ethtx } = fixture;
			await expect(
				contract.recoverERC20(ethtx.address, deployer, 1),
			).to.be.revertedWith('transfer amount exceeds balance');
		});

		describe('should succeed', function () {
			const amount = parseETHtx('100');

			beforeEach(async function () {
				const { contract, ethtx } = fixture;
				await ethtx.mockMint(contract.address, amount);
			});

			it('and recover an ERC20', async function () {
				const { contract, tester, ethtx, feeLogic } = fixture;
				await contract.recoverERC20(ethtx.address, tester, amount);

				const fee = await feeLogic.getFee(contract.address, tester, amount);
				expect(await ethtx.balanceOf(tester)).to.eq(amount.sub(fee));
			});

			it('and emit Recovered event', async function () {
				const { contract, deployer, tester, ethtx } = fixture;
				await expect(contract.recoverERC20(ethtx.address, tester, amount))
					.to.emit(contract, 'Recovered')
					.withArgs(deployer, ethtx.address, tester, amount);
			});
		});

		it('can only be called by owner', async function () {
			const { testerContract, tester, ethtx } = fixture;
			await expect(
				testerContract.recoverERC20(ethtx.address, tester, 1),
			).to.be.revertedWith('caller is not the owner');
		});
	});

	describe('removeLp', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.removeLp(zeroAddress)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should revert if the liquidity pool is not present', async function () {
			const { contract } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(contract.removeLp(address)).to.be.revertedWith(
				'liquidity pool not present',
			);
		});

		it('should update numLiquidityPools', async function () {
			const { contract } = fixture;
			const addressOne = zeroPadAddress('0x1');
			const addressTwo = zeroPadAddress('0x2');
			await contract.addLp(addressOne);
			await contract.addLp(addressTwo);
			expect(
				await contract.numLiquidityPools(),
				'mismatch before removal',
			).to.eq(2);

			await contract.removeLp(addressOne);
			expect(
				await contract.numLiquidityPools(),
				'mismatch after removal',
			).to.eq(1);
		});

		it('should update liquidityPoolsAt', async function () {
			const { contract } = fixture;
			const addressOne = zeroPadAddress('0x1');
			const addressTwo = zeroPadAddress('0x2');
			await contract.addLp(addressOne);
			await contract.addLp(addressTwo);
			expect(
				await contract.liquidityPoolsAt(0),
				'mismatch before removal',
			).to.eq(addressOne);

			await contract.removeLp(addressOne);
			expect(
				await contract.liquidityPoolsAt(0),
				'mismatch after removal',
			).to.eq(addressTwo);
		});

		it('should emit LpRemoved event', async function () {
			const { contract, deployer } = fixture;
			const address = zeroPadAddress('0x1');
			await contract.addLp(address);
			await expect(contract.removeLp(address))
				.to.emit(contract, 'LpRemoved')
				.withArgs(deployer, address);
		});
	});

	describe('setEthmx', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(testerContract.setEthmx(address)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should set ETHmx address', async function () {
			const { contract } = fixture;
			const address = zeroPadAddress('0x1');
			await contract.setEthmx(address);
			expect(await contract.ethmx()).to.eq(address);
		});

		it('should emit EthmxAddressSet event', async function () {
			const { contract, deployer } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(contract.setEthmx(address))
				.to.emit(contract, 'EthmxSet')
				.withArgs(deployer, address);
		});
	});

	describe('setEthtx', function () {
		it('should set ETHtx address', async function () {
			const { contract } = fixture;
			const address = zeroPadAddress('0x1');
			await contract.setEthtx(address);
			expect(await contract.ethtx()).to.eq(address);
		});

		it('should emit EthtxAddressSet event', async function () {
			const { contract, deployer } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(contract.setEthtx(address))
				.to.emit(contract, 'EthtxSet')
				.withArgs(deployer, address);
		});

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(testerContract.setEthtx(address)).to.be.revertedWith(
				'caller is not the owner',
			);
		});
	});

	describe('setEthtxAMM', function () {
		it('should set ETHtxAMM address', async function () {
			const { contract } = fixture;
			const address = zeroPadAddress('0x1');
			await contract.setEthtxAMM(address);
			expect(await contract.ethtxAMM()).to.eq(address);
		});

		it('should emit EthtxAMMAddressSet event', async function () {
			const { contract, deployer } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(contract.setEthtxAMM(address))
				.to.emit(contract, 'EthtxAMMSet')
				.withArgs(deployer, address);
		});

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(testerContract.setEthtxAMM(address)).to.be.revertedWith(
				'caller is not the owner',
			);
		});
	});

	describe('setLpReciipient', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(
				testerContract.setLpRecipient(zeroAddress),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should update lpRecipient', async function () {
			const { contract } = fixture;
			const newAddress = zeroPadAddress('0x20');

			expect(newAddress !== lpRecipient, 'will not change lpRecipient');

			await contract.setLpRecipient(newAddress);
			expect(await contract.lpRecipient()).to.eq(newAddress);
		});

		it('should emit LpRecipientSet event', async function () {
			const { contract, deployer } = fixture;
			const newAddress = zeroPadAddress('0x20');

			await expect(contract.setLpRecipient(newAddress))
				.to.emit(contract, 'LpRecipientSet')
				.withArgs(deployer, newAddress);
		});
	});

	describe('setLpShare', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setLpShare(0, 1)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should update lpShare', async function () {
			const { contract } = fixture;
			const newNum = 43;
			const newDen = 123;

			expect(newNum, 'numerator will not change').to.not.eq(lpShareNumerator);
			expect(newDen, 'denominator will not change').to.not.eq(
				lpShareDenominator,
			);

			await contract.setLpShare(newNum, newDen);
			const [num, den] = await contract.lpShare();
			expect(num, 'numerator mismatch').to.eq(newNum);
			expect(den, 'denominator mismatch').to.eq(newDen);
		});

		it('should emit LpShareSet event', async function () {
			const { contract, deployer } = fixture;
			const newNum = 43;
			const newDen = 123;

			await expect(contract.setLpShare(newNum, newDen))
				.to.emit(contract, 'LpShareSet')
				.withArgs(deployer, newNum, newDen);
		});
	});

	describe('setMintGasPrice', function () {
		it('should set mintGasPrice', async function () {
			const { contract } = fixture;
			const value = 5;
			await contract.setMintGasPrice(value);
			expect(await contract.mintGasPrice()).to.eq(value);
		});

		it('should emit MintGasPriceSet event', async function () {
			const { contract, deployer } = fixture;
			const value = 5;
			await expect(contract.setMintGasPrice(value))
				.to.emit(contract, 'MintGasPriceSet')
				.withArgs(deployer, value);
		});

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setMintGasPrice(5)).to.be.revertedWith(
				'caller is not the owner',
			);
		});
	});

	describe('setWeth', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(testerContract.setWeth(address)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should set WETH address', async function () {
			const { contract } = fixture;
			const address = zeroPadAddress('0x1');
			await contract.setWeth(address);
			expect(await contract.weth()).to.eq(address);
		});

		it('should emit WethAddressSet event', async function () {
			const { contract, deployer } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(contract.setWeth(address))
				.to.emit(contract, 'WethSet')
				.withArgs(deployer, address);
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
