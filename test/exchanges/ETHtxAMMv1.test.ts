import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseEther, keccak256, toUtf8Bytes } from 'ethers/lib/utils';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { JsonRpcSigner } from '@ethersproject/providers';
import { One } from '@ethersproject/constants';

import { zeroAddress, zeroPadAddress } from '../helpers/address';
import {
	parseGwei,
	parseETHtx,
	ethToEthtx,
	ethtxToEth,
	sendWETH,
	GAS_PER_ETHTX,
	ethUsedOnGas,
	parseETHmx,
} from '../helpers/conversions';
import {
	MockETHmx,
	MockETHmx__factory,
	ETHmxMinter,
	ETHmxMinter__factory,
	ETHtxAMMv1 as ETHtxAMM,
	ETHtxAMMv1__factory as ETHtxAMM__factory,
	FeeLogic,
	FeeLogic__factory,
	MockETHtxv1 as MockETHtx,
	MockETHtxv1__factory as MockETHtx__factory,
	MockGasPrice,
	MockGasPrice__factory,
	WETH9__factory,
	WETH9,
} from '../../build/types/ethers-v5';

const contractName = 'ETHtxAMMv1';

const ethtxMintParams = {
	minMintPrice: parseGwei('50'),
	mu: 5,
	lambda: 4,
};
const defaultGasPrice = parseGwei('200');
const baseGasPrice = defaultGasPrice
	.mul(ethtxMintParams.mu)
	.add(ethtxMintParams.minMintPrice);
const feeRecipient = zeroPadAddress('0x1');
const targetCRatioNumerator = 2;
const targetCRatioDenominator = 1;
const feeNumerator = 25;
const feeDenominator = 1000;
const oracleRole = keccak256(toUtf8Bytes('ORACLE_ROLE'));
const oracleUpdateInterval = 3600;

async function addWETH(fixture: Fixture, amount: BigNumberish): Promise<void> {
	const { contract, weth } = fixture;
	await sendWETH(weth, contract.address, amount);
}

function calcFee(amount: BigNumber): BigNumber {
	return amount.mul(feeNumerator).div(feeDenominator);
}

function undoFee(amount: BigNumber): BigNumber {
	return amount.mul(feeDenominator).div(feeDenominator - feeNumerator);
}

function targetETH(amount: BigNumber): BigNumber {
	return amount.mul(targetCRatioNumerator).div(targetCRatioDenominator);
}

function targetETHtx(
	amountETH: BigNumber,
	gasPrice: BigNumber = defaultGasPrice,
): BigNumber {
	const target = amountETH
		.mul(targetCRatioDenominator)
		.div(targetCRatioNumerator);
	return ethToEthtx(gasPrice, target);
}

function maxGasPrice(
	ethSupply: BigNumber,
	ethtxOutstanding: BigNumber,
): BigNumber {
	const num = ethSupply.mul(parseEther('1')).mul(targetCRatioDenominator);
	const den = ethtxOutstanding.mul(GAS_PER_ETHTX).mul(targetCRatioNumerator);
	return num.div(den);
}

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: ETHtxAMM;
	contractImpl: ETHtxAMM;
	testerContract: ETHtxAMM;
	ethtx: MockETHtx;
	ethmx: MockETHmx;
	ethmxMinter: ETHmxMinter;
	feeLogic: FeeLogic;
	oracle: MockGasPrice;
	weth: WETH9;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ deployments, getNamedAccounts, waffle }) => {
		const { deploy } = deployments;
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const oracle = await new MockGasPrice__factory(deployerSigner).deploy(
			deployer,
			oracleUpdateInterval,
			defaultGasPrice,
		);
		await oracle.grantRole(oracleRole, deployer);

		const weth = await new WETH9__factory(deployerSigner).deploy();

		const ethtx = await new MockETHtx__factory(deployerSigner).deploy(
			deployer,
		);

		const ethmx = await new MockETHmx__factory(deployerSigner).deploy(
			deployer,
		);

		const result = await deploy('ETHtxAMMTest', {
			contract: 'ETHtxAMM',
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
		const contract = ETHtxAMM__factory.connect(result.address, deployerSigner);
		await contract.postInit({
			ethtx: ethtx.address,
			gasOracle: oracle.address,
			weth: weth.address,
			targetCRatioNum: targetCRatioNumerator,
			targetCRatioDen: targetCRatioDenominator,
			ethmx: ethmx.address,
		});

		const contractImpl = ETHtxAMM__factory.connect(
			(await deployments.get('ETHtxAMMTest_Implementation')).address,
			deployerSigner,
		);

		const ethmxMinter = await new ETHmxMinter__factory(deployerSigner).deploy(
			deployer,
		);
		await ethmxMinter.postInit({
			ethmx: ethmx.address,
			ethtx: ethtx.address,
			ethtxAMM: contract.address,
			weth: weth.address,
			ethtxMintParams,
			ethmxMintParams: {
				cCapNum: 10,
				cCapDen: 1,
				zetaFloorNum: 2,
				zetaFloorDen: 1,
				zetaCeilNum: 4,
				zetaCeilDen: 1,
			},
			lpShareNumerator: 25,
			lpShareDenominator: 100,
			lps: [],
			lpRecipient: zeroAddress,
		});

		const feeLogic = await new FeeLogic__factory(deployerSigner).deploy({
			owner: deployer,
			recipient: feeRecipient,
			feeRateNumerator: feeNumerator,
			feeRateDenominator: feeDenominator,
			exemptions: [{ account: ethmxMinter.address, isExempt: true }],
			rebaseInterval: 0,
			rebaseFeeRateNum: 0,
			rebaseFeeRateDen: 1,
			rebaseExemptions: [{ account: contract.address, isExempt: true }],
		});

		await ethmx.setMinter(ethmxMinter.address);
		await ethtx.postInit({
			feeLogic: feeLogic.address,
			minters: [ethmxMinter.address, contract.address],
			rebasers: [],
		});
		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			contractImpl,
			testerContract,
			ethtx,
			ethmx,
			ethmxMinter,
			feeLogic,
			oracle,
			weth,
		};
	},
);

describe.skip(contractName, function () {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('constructor', function () {
		it('initial state is correct', async function () {
			const {
				contract,
				contractImpl,
				deployer,
				ethmx,
				ethtx,
				feeLogic,
				oracle,
				weth,
			} = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);
			expect(
				await contractImpl.owner(),
				'implemenation owner address mismatch',
			).to.eq(deployer);

			expect(await contract.ethmx(), 'ethmx address mismatch').to.eq(
				ethmx.address,
			);

			expect(await contract.ethtx(), 'ethtx address mismatch').to.eq(
				ethtx.address,
			);

			expect(await contract.feeLogic(), 'feeLogic address mismatch').to.eq(
				feeLogic.address,
			);

			expect(await contract.gasOracle(), 'gas oracle address mismatch').to.eq(
				oracle.address,
			);

			expect(await contract.weth(), 'WETH address mismatch').to.eq(
				weth.address,
			);

			const [targetCRatioNum, targetCRatioDen] = await contract.targetCRatio();
			expect(targetCRatioNum, 'targetCRatio numerator mismatch').to.eq(
				targetCRatioNumerator,
			);
			expect(targetCRatioDen, 'targetCRatio denominator mismatch').to.eq(
				targetCRatioDenominator,
			);

			expect(await contract.gasPerETHtx(), 'gasPerETHtx mismatch').to.eq(
				GAS_PER_ETHTX,
			);
			expect(await contract.gasPrice(), 'gasPrice mismatch').to.eq(
				defaultGasPrice,
			);

			expect(await contract.ethSupply(), 'ethSupply mismatch').to.eq(0);
			expect(await contract.ethtxAvailable(), 'ethtxAvailable mismatch').to.eq(
				0,
			);
			expect(
				await contract.ethtxOutstanding(),
				'ethtxOutstanding mismatch',
			).to.eq(0);

			expect(await contract.ethNeeded(), 'ethNeeded mismatch').to.eq(0);
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
					ethtx: zeroAddress,
					gasOracle: zeroAddress,
					weth: zeroAddress,
					targetCRatioNum: 0,
					targetCRatioDen: 0,
					ethmx: zeroAddress,
				}),
			).to.be.revertedWith('caller is not the owner');
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

	describe('cRatio', function () {
		it('should be correct', async function () {
			const { contract, ethtx, tester } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);

			const ethOutstanding = parseEther('5');
			const amountETHtx = ethToEthtx(defaultGasPrice, ethOutstanding);
			await ethtx.mockMint(tester, amountETHtx);

			const [num, den] = await contract.cRatio();
			expect(num, 'cRatio numerator mismatch').to.eq(ethSupply);
			expect(den, 'cRatio denominator mismatch').to.eq(ethOutstanding.sub(1));
		});
	});

	describe('cRatioBelowTarget', function () {
		it('should be false when denominator is zero', async function () {
			const { contract } = fixture;
			// Currently can never be zero.
			expect(await contract.cRatioBelowTarget()).to.be.false;
		});

		it('should be false when cRatio > targetCRatio', async function () {
			const { contract, ethtx, tester } = fixture;
			const ethtxOutstanding = ethToEthtx(defaultGasPrice, parseEther('10'));
			const ethOutstanding = ethtxToEth(defaultGasPrice, ethtxOutstanding);
			const ethSupply = targetETH(ethOutstanding).add(1);

			await addWETH(fixture, ethSupply);
			await ethtx.mockMint(tester, ethtxOutstanding);

			expect(await contract.cRatioBelowTarget()).to.be.false;
		});

		it('should be false when cRatio == targetCRatio', async function () {
			const { contract, ethtx, tester } = fixture;
			const ethtxOutstanding = ethToEthtx(defaultGasPrice, parseEther('10'));
			const ethOutstanding = ethtxToEth(defaultGasPrice, ethtxOutstanding);
			const ethSupply = targetETH(ethOutstanding);

			await addWETH(fixture, ethSupply);
			await ethtx.mockMint(tester, ethtxOutstanding);

			expect(await contract.cRatioBelowTarget()).to.be.false;
		});

		it('should be true when cRatio < targetCRatio', async function () {
			const { contract, ethtx, tester } = fixture;
			const ethtxOutstanding = ethToEthtx(defaultGasPrice, parseEther('10'));
			const ethOutstanding = ethtxToEth(defaultGasPrice, ethtxOutstanding);
			const ethSupply = targetETH(ethOutstanding).sub(1);

			await addWETH(fixture, ethSupply);
			await ethtx.mockMint(tester, ethtxOutstanding);

			expect(await contract.cRatioBelowTarget()).to.be.true;
		});
	});

	describe('ethToExactEthtx', function () {
		it('should be correct', async function () {
			const { contract } = fixture;
			const amountETHtx = parseETHtx('100');
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx);
			expect(await contract.ethToExactEthtx(amountETHtx)).to.eq(amountETH);
		});

		it('should change with gas price', async function () {
			const { contract, oracle } = fixture;

			const gasPrice = parseGwei('100');
			expect(gasPrice, 'gas price will not change').to.not.eq(defaultGasPrice);
			await oracle.setGasPrice(gasPrice);

			const amountETHtx = parseETHtx('100');
			const amountETH = ethtxToEth(gasPrice, amountETHtx);
			expect(await contract.ethToExactEthtx(amountETHtx)).to.eq(amountETH);
		});
	});

	describe('exactEthtxToEth', function () {
		it('should be correct', async function () {
			const { contract } = fixture;

			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx.sub(fee));

			expect(await contract.exactEthtxToEth(amountETHtx)).to.eq(amountETH);
		});

		it('should change with gas price', async function () {
			const { contract, oracle } = fixture;

			const gasPrice = parseGwei('100');
			expect(gasPrice, 'gas price will not change').to.not.eq(defaultGasPrice);
			await oracle.setGasPrice(gasPrice);

			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const amountETH = ethtxToEth(gasPrice, amountETHtx.sub(fee));

			expect(await contract.exactEthtxToEth(amountETHtx)).to.eq(amountETH);
		});

		it('should use maxGasPrice cap', async function () {
			const { contract, ethtx, oracle, tester } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);
			const ethtxOutstanding = ethToEthtx(
				defaultGasPrice,
				targetETH(ethSupply),
			);
			await ethtx.mockMint(tester, ethtxOutstanding);

			const maxGasPrice = await contract.maxGasPrice();
			const gasPrice = maxGasPrice.add(parseGwei('200'));
			await oracle.setGasPrice(gasPrice);

			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const amountETH = ethtxToEth(maxGasPrice, amountETHtx.sub(fee));

			expect(await contract.exactEthtxToEth(amountETHtx)).to.eq(amountETH);
		});
	});

	describe('ethNeeded', function () {
		it('should be zero when ETH outstanding == 0', async function () {
			const { contract } = fixture;

			await addWETH(fixture, 1);

			expect(await contract.ethNeeded()).to.eq(0);
		});

		it('should be zero when ETH supply > outstanding', async function () {
			const { contract, ethtx, tester } = fixture;

			const supply = parseEther('10');
			await addWETH(fixture, supply);
			const oustanding = targetETHtx(supply).sub(1);
			await ethtx.mockMint(tester, oustanding);

			expect(await contract.ethNeeded()).to.eq(0);
		});

		it('should be zero when ETH supply == outstanding', async function () {
			const { contract, ethtx, tester } = fixture;

			const supply = parseEther('10');
			await addWETH(fixture, supply);
			const oustanding = targetETHtx(supply);
			await ethtx.mockMint(tester, oustanding);

			expect(await contract.ethNeeded()).to.eq(0);
		});

		it('should be correct when ETH supply < outstanding', async function () {
			const { contract, ethtx, tester } = fixture;

			const supply = parseEther('10');
			await addWETH(fixture, supply);
			const oustanding = targetETHtx(supply).add(1);
			await ethtx.mockMint(tester, oustanding);

			const needed = targetETH(ethtxToEth(defaultGasPrice, oustanding)).sub(
				supply,
			);
			expect(await contract.ethNeeded()).to.eq(needed);
		});

		it('should be correct when outstanding == 1 weiETHtx', async function () {
			const { contract, ethtx, tester } = fixture;

			await ethtx.mockMint(tester, 1);
			const expected = targetETH(ethtxToEth(defaultGasPrice, One));

			expect(await contract.ethNeeded()).to.eq(expected);
		});
	});

	describe('exactEthToEthtx', function () {
		it('should be correct', async function () {
			const { contract } = fixture;
			const amountETH = parseEther('10');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH);
			expect(await contract.exactEthToEthtx(amountETH)).to.eq(amountETHtx);
		});

		it('should change with gas price', async function () {
			const { contract, oracle } = fixture;

			const gasPrice = parseGwei('100');
			expect(gasPrice, 'gas price will not change').to.not.eq(defaultGasPrice);
			await oracle.setGasPrice(gasPrice);

			const amountETH = parseEther('10');
			const amountETHtx = ethToEthtx(gasPrice, amountETH);
			expect(await contract.exactEthToEthtx(amountETH)).to.eq(amountETHtx);
		});
	});

	describe('ethtxToExactEth', function () {
		it('should be correct', async function () {
			const { contract } = fixture;

			const amountETH = parseEther('10');
			const amountETHtx = undoFee(ethToEthtx(defaultGasPrice, amountETH));

			expect(await contract.ethtxToExactEth(amountETH)).to.eq(amountETHtx);
		});

		it('should change with gas price', async function () {
			const { contract, oracle } = fixture;

			const gasPrice = parseGwei('100');
			expect(gasPrice, 'gas price will not change').to.not.eq(defaultGasPrice);
			await oracle.setGasPrice(gasPrice);

			const amountETH = parseEther('10');
			const amountETHtx = undoFee(ethToEthtx(gasPrice, amountETH));

			expect(await contract.ethtxToExactEth(amountETH)).to.eq(amountETHtx);
		});

		it('should use maxGasPrice cap', async function () {
			const { contract, ethtx, oracle, tester } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);
			const ethtxOutstanding = ethToEthtx(
				defaultGasPrice,
				targetETH(ethSupply),
			);
			await ethtx.mockMint(tester, ethtxOutstanding);

			const maxGasPrice = await contract.maxGasPrice();
			const gasPrice = maxGasPrice.add(parseGwei('200'));
			await oracle.setGasPrice(gasPrice);

			const amountETH = parseEther('10');
			const amountETHtx = undoFee(ethToEthtx(maxGasPrice, amountETH));

			expect(await contract.ethtxToExactEth(amountETH)).to.eq(amountETHtx);
		});
	});

	describe('ethSupply', function () {
		it('should reflect contract WETH balance', async function () {
			const { contract } = fixture;
			const amount = parseEther('10');
			await addWETH(fixture, amount);
			expect(await contract.ethSupply()).to.eq(amount);
		});
	});

	describe('ethSupplyTarget', function () {
		it('should reflect cRatio and targetCRatio', async function () {
			const { contract, ethtx, tester } = fixture;
			const ethSupply = parseEther('10');
			const ethtxOutstanding = parseETHtx('1000');

			await addWETH(fixture, ethSupply);
			await ethtx.mockMint(tester, ethtxOutstanding);

			const [, cRatioDen] = await contract.cRatio();

			const expected = cRatioDen
				.mul(targetCRatioNumerator)
				.div(targetCRatioDenominator);

			expect(await contract.ethSupplyTarget()).to.eq(expected);
		});
	});

	describe('ethtxAvailable', function () {
		it('should reflect contract ETHtx balance', async function () {
			const { contract, ethtx } = fixture;
			const amount = parseETHtx('100');
			await ethtx.mockMint(contract.address, amount);
			expect(await contract.ethtxAvailable()).to.eq(amount);
		});
	});

	describe('ethtxOutstanding', function () {
		it('should reflect ETHtx supply not in contract', async function () {
			const { contract, ethtx, tester } = fixture;
			const amount = parseETHtx('100');
			await ethtx.mockMint(contract.address, amount.mul(2));
			await ethtx.mockMint(tester, amount);
			expect(await contract.ethtxOutstanding()).to.eq(amount);
		});
	});

	describe('feeLogic', function () {
		it('should update with ETHtx feeLogic', async function () {
			const { contract, ethtx, tester } = fixture;
			await ethtx.setFeeLogic(tester);
			expect(await contract.feeLogic()).to.eq(tester);
		});
	});

	describe('gasPrice', function () {
		it('should update with oracle', async function () {
			const { contract, oracle } = fixture;

			const gasPrice = parseGwei('100');
			expect(gasPrice, 'gas price will not change').to.not.eq(defaultGasPrice);
			await oracle.setGasPrice(gasPrice);

			expect(await contract.gasPrice()).to.eq(gasPrice);
		});
	});

	describe('gasPriceAtRedemption', function () {
		it('should return gasPrice when gasPrice < maxGasPrice', async function () {
			const { contract, ethtx, tester } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);
			const ethtxOutstanding = parseETHtx('100');
			await ethtx.mockMint(tester, ethtxOutstanding);

			expect(
				await contract.maxGasPrice(),
				'maxGasPrice is not gt gasPrice',
			).to.be.gt(defaultGasPrice);

			expect(await contract.gasPriceAtRedemption()).to.eq(defaultGasPrice);
		});

		it('should return maxGasPrice when gasPrice > maxGasPrice', async function () {
			const { contract, ethtx, tester, oracle } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);
			const ethtxOutstanding = ethToEthtx(
				defaultGasPrice,
				targetETH(ethSupply),
			);
			await ethtx.mockMint(tester, ethtxOutstanding);

			const maxGasPrice = await contract.maxGasPrice();
			const gasPrice = maxGasPrice.add(parseGwei('200'));
			await oracle.setGasPrice(gasPrice);

			expect(await contract.gasPriceAtRedemption()).to.eq(maxGasPrice);
		});
	});

	describe('maxGasPrice', function () {
		it('should return gasPrice when ethtxOutstanding is zero', async function () {
			const { contract } = fixture;
			expect(await contract.maxGasPrice()).to.eq(defaultGasPrice);
		});

		it('should be correct', async function () {
			const { contract, ethtx, tester } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);
			const ethtxOutstanding = ethToEthtx(
				defaultGasPrice,
				targetETH(ethSupply),
			);
			await ethtx.mockMint(tester, ethtxOutstanding);

			const expected = maxGasPrice(ethSupply, ethtxOutstanding);
			expect(await contract.maxGasPrice()).to.eq(expected);
		});
	});

	describe('swapEthForEthtx', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 3600;
			await expect(
				contract.swapEthForEthtx(deadline, { value: parseEther('1') }),
			).to.be.revertedWith('expired');
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(
				contract.swapEthForEthtx(deadline, { value: parseEther('1') }),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amount = parseEther('1');
			await expect(
				contract.swapEthForEthtx(deadline, { value: amount }),
			).to.be.revertedWith('not enough ETHtx available');
		});

		it('should swap ETH -> WETH -> ETHtx', async function () {
			const { contract, ethtx, deployer, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH);
			const fee = calcFee(amountETHtx);

			await ethtx.mockMint(contract.address, amountETHtx);
			await expect(contract.swapEthForEthtx(deadline, { value: amountETH }))
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtx.sub(fee));

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await ethtx.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(0);

			expect(
				await ethtx.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtx.sub(fee));

			expect(
				await ethtx.balanceOf(feeRecipient),
				'feeRecipient ETHtx balance mismatch',
			).to.eq(fee);
		});

		it('should revert on zero', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			await expect(
				contract.swapEthForEthtx(deadline, { value: 0 }),
			).to.be.revertedWith('cannot swap zero');
		});

		it('should transfer back 233 weiETHtx with 1 wei', async function () {
			const { contract, ethtx, deployer } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			await ethtx.mockMint(contract.address, parseETHtx('1000'));
			await addWETH(fixture, parseEther('10'));

			await expect(contract.swapEthForEthtx(deadline, { value: 1 }))
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, 233);
		});
	});

	describe('swapWethForEthtx', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 3600;
			await expect(
				contract.swapWethForEthtx(parseEther('1'), deadline),
			).to.be.revertedWith('expired');
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(
				contract.swapWethForEthtx(parseEther('1'), deadline),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const amount = parseEther('1');
			await weth.deposit({ value: amount });
			await weth.approve(contract.address, amount);

			await expect(
				contract.swapWethForEthtx(amount, deadline),
			).to.be.revertedWith('not enough ETHtx available');
		});

		it('should swap WETH -> ETHtx', async function () {
			const { contract, ethtx, deployer, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH);
			const fee = calcFee(amountETHtx);
			const amountETHtxAferFee = amountETHtx.sub(fee);

			await weth.deposit({ value: amountETH });
			await weth.approve(contract.address, amountETH);

			await ethtx.mockMint(contract.address, amountETHtx);

			await expect(contract.swapWethForEthtx(amountETH, deadline))
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtxAferFee);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await ethtx.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(0);

			expect(
				await ethtx.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtxAferFee);
		});

		it('should revert on zero', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			await expect(contract.swapWethForEthtx(0, deadline)).to.be.revertedWith(
				'cannot swap zero',
			);
		});

		it('should transfer back correct weiETHtx with 1 wei', async function () {
			const { contract, ethtx, deployer, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethtxOut = BigNumber.from(238);
			const ethtxOutAfterFee = ethtxOut.sub(calcFee(ethtxOut));

			await weth.deposit({ value: 1 });
			await weth.approve(contract.address, 1);

			await ethtx.mockMint(contract.address, parseETHtx('1000'));
			await addWETH(fixture, parseEther('10'));

			await expect(contract.swapWethForEthtx(1, deadline))
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, ethtxOutAfterFee);
		});
	});

	describe('swapEthForExactEthtx', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.swapEthForExactEthtx(amountETHtx, deadline, {
					value: amountETH,
				}),
			).to.be.revertedWith('expired');
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(
				contract.swapEthForExactEthtx(amountETHtx, deadline, {
					value: amountETH,
				}),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.swapEthForExactEthtx(amountETHtx, deadline, {
					value: amountETH,
				}),
			).to.be.revertedWith('not enough ETHtx available');
		});

		it('should revert if ETH needed exceeds ETH value', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx.sub(1));
			await expect(
				contract.swapEthForExactEthtx(amountETHtx, deadline, {
					value: amountETH,
				}),
			).to.be.revertedWith('amountIn exceeds max');
		});

		it('should swap ETH -> WETH -> ETHtx', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const amountETHtxAfterFee = amountETHtx.sub(fee);
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx).add(1);

			await ethtx.mockMint(contract.address, amountETHtx.add(1));
			await expect(
				contract.swapEthForExactEthtx(amountETHtx, deadline, {
					value: amountETH,
				}),
			)
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtxAfterFee);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await ethtx.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(1);

			expect(
				await ethtx.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtxAfterFee);
		});

		it('should refund leftover ETH', async function () {
			const { contract, deployerSigner, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('10');

			const ethSpent = ethtxToEth(defaultGasPrice, amountETHtx).add(1);
			expect(ethSpent, 'ETH required >= ETH sent').to.be.lt(amountETH);

			const initBalance = await deployerSigner.getBalance();

			let tx = await ethtx.mockMint(contract.address, amountETHtx);
			let ethUsed = await ethUsedOnGas(tx);

			tx = await contract.swapEthForExactEthtx(amountETHtx, deadline, {
				value: amountETH,
			});
			ethUsed = ethUsed.add(await ethUsedOnGas(tx));

			const ethLost = ethSpent.add(ethUsed);
			expect(await deployerSigner.getBalance()).to.eq(
				initBalance.sub(ethLost),
			);
		});

		it('should revert on zero', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			await expect(
				contract.swapEthForExactEthtx(1, deadline, { value: 0 }),
			).to.be.revertedWith('cannot swap zero');
		});

		it('should revert with 1 wei : 239 weiETHtx', async function () {
			const { contract, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethIn = 1;
			const ethtxOut = 239;

			await ethtx.mockMint(contract.address, ethtxOut);
			await sendWETH(weth, contract.address, parseEther('10'));

			await expect(
				contract.swapEthForExactEthtx(ethtxOut, deadline, { value: ethIn }),
			).to.be.revertedWith('amountIn exceeds max');
		});

		it('should transfer back correct weiETHtx with 1 wei', async function () {
			const { contract, deployer, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethIn = 1;
			const ethtxOut = BigNumber.from(238);
			const fee = calcFee(ethtxOut);
			const ethtxOutAfterFee = ethtxOut.sub(fee);

			await ethtx.mockMint(contract.address, parseETHtx('1000'));
			await addWETH(fixture, parseEther('10'));

			await expect(
				contract.swapEthForExactEthtx(ethtxOut, deadline, { value: ethIn }),
			)
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, ethtxOutAfterFee);
		});
	});

	describe('swapWethForExactEthtx', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.swapWethForExactEthtx(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('expired');
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(
				contract.swapWethForExactEthtx(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.swapWethForExactEthtx(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('not enough ETHtx available');
		});

		it('should revert if WETH needed exceeds amountInMax', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx.sub(1)).add(1);
			await expect(
				contract.swapWethForExactEthtx(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('amountIn exceeds max');
		});

		it('should swap WETH -> ETHtx', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const amountETHtxAfterFee = amountETHtx.sub(fee);
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx).add(1);

			await ethtx.mockMint(contract.address, amountETHtx.add(1));

			await weth.deposit({ value: amountETH });
			await weth.approve(contract.address, amountETH);

			await expect(
				contract.swapWethForExactEthtx(amountETH, amountETHtx, deadline),
			)
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtxAfterFee);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await ethtx.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(1);

			expect(
				await ethtx.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtxAfterFee);
		});

		it('should revert on zero', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			await expect(
				contract.swapWethForExactEthtx(0, 1, deadline),
			).to.be.revertedWith('cannot swap zero');
		});

		it('should revert with 1 wei : 239 weiETHtx', async function () {
			const { contract, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethIn = 1;
			const ethtxOut = 239;

			await ethtx.mockMint(contract.address, ethtxOut);
			await sendWETH(weth, contract.address, parseEther('10'));

			await expect(
				contract.swapWethForExactEthtx(ethIn, ethtxOut, deadline),
			).to.be.revertedWith('amountIn exceeds max');
		});

		it('should transfer back correct weiETHtx with 1 wei', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethIn = 1;
			const ethtxOut = BigNumber.from(238);
			const ethtxOutAfterFee = ethtxOut.sub(calcFee(ethtxOut));

			await weth.deposit({ value: ethIn });
			await weth.approve(contract.address, ethIn);

			await ethtx.mockMint(contract.address, parseETHtx('1000'));
			await addWETH(fixture, parseEther('10'));

			await expect(contract.swapWethForExactEthtx(ethIn, ethtxOut, deadline))
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, ethtxOutAfterFee);
		});
	});

	describe('swapExactEthForEthtx', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.swapExactEthForEthtx(amountETHtx, deadline, {
					value: amountETH,
				}),
			).to.be.revertedWith('expired');
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(
				contract.swapExactEthForEthtx(amountETHtx, deadline, {
					value: amountETH,
				}),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.swapExactEthForEthtx(amountETHtx, deadline, {
					value: amountETH,
				}),
			).to.be.revertedWith('not enough ETHtx available');
		});

		it('should revert if ETHtx amountOut < amountOutMin', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH).add(1);
			await expect(
				contract.swapExactEthForEthtx(amountETHtx, deadline, {
					value: amountETH,
				}),
			).to.be.revertedWith('amountOut below min');
		});

		it('should swap ETH -> WETH -> ETHtx', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH);
			const amountETHtxAfterFee = amountETHtx.sub(calcFee(amountETHtx));

			await ethtx.mockMint(contract.address, amountETHtx.add(1));
			await expect(
				contract.swapExactEthForEthtx(amountETHtx, deadline, {
					value: amountETH,
				}),
			)
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtxAfterFee);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await ethtx.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(1);

			expect(
				await ethtx.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtxAfterFee);
		});

		it('should revert on zero', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			await expect(
				contract.swapExactEthForEthtx(1, deadline, { value: 0 }),
			).to.be.revertedWith('cannot swap zero');
		});

		it('should revert with 1 wei : 239 weiETHtx', async function () {
			const { contract, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethIn = 1;
			const ethtxOut = 239;

			await ethtx.mockMint(contract.address, ethtxOut);
			await sendWETH(weth, contract.address, parseEther('10'));

			await expect(
				contract.swapExactEthForEthtx(ethtxOut, deadline, { value: ethIn }),
			).to.be.revertedWith('amountOut below min');
		});

		it('should transfer back correct weiETHtx with 1 wei', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethIn = 1;
			const ethtxOut = BigNumber.from(238);
			const ethtxOutAfterFee = ethtxOut.sub(calcFee(ethtxOut));

			await weth.deposit({ value: ethIn });
			await weth.approve(contract.address, ethIn);

			await ethtx.mockMint(contract.address, parseETHtx('1000'));
			await addWETH(fixture, parseEther('10'));

			await expect(
				contract.swapExactEthForEthtx(ethtxOut, deadline, { value: ethIn }),
			)
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, ethtxOutAfterFee);
		});
	});

	describe('swapExactWethForEthtx', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.swapExactWethForEthtx(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('expired');
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(
				contract.swapExactWethForEthtx(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.swapExactWethForEthtx(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('not enough ETHtx available');
		});

		it('should revert if ETHtx amountOut < amountOutMin', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH).add(1);
			await expect(
				contract.swapExactWethForEthtx(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('amountOut below min');
		});

		it('should swap WETH -> ETHtx', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH);
			const amountETHtxAfterFee = amountETHtx.sub(calcFee(amountETHtx));

			await ethtx.mockMint(contract.address, amountETHtx.add(1));

			await weth.deposit({ value: amountETH });
			await weth.approve(contract.address, amountETH);

			await expect(
				contract.swapExactWethForEthtx(amountETH, amountETHtx, deadline),
			)
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtxAfterFee);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await ethtx.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(1);

			expect(
				await ethtx.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtxAfterFee);
		});

		it('should revert on zero', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			await expect(
				contract.swapExactWethForEthtx(0, 1, deadline),
			).to.be.revertedWith('cannot swap zero');
		});

		it('should revert with 1 wei : 239 weiETHtx', async function () {
			const { contract, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethIn = 1;
			const ethtxOut = 239;

			await ethtx.mockMint(contract.address, ethtxOut);
			await sendWETH(weth, contract.address, parseEther('10'));

			await expect(
				contract.swapExactWethForEthtx(ethIn, ethtxOut, deadline),
			).to.be.revertedWith('amountOut below min');
		});

		it('should transfer back correct weiETHtx with 1 wei', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethIn = 1;
			const ethtxOut = BigNumber.from(238);
			const ethtxOutAfterFee = ethtxOut.sub(calcFee(ethtxOut));

			await weth.deposit({ value: ethIn });
			await weth.approve(contract.address, ethIn);

			await ethtx.mockMint(contract.address, parseETHtx('1000'));
			await addWETH(fixture, parseEther('10'));

			await expect(contract.swapExactWethForEthtx(ethIn, ethtxOut, deadline))
				.to.emit(ethtx, 'Transfer')
				.withArgs(contract.address, deployer, ethtxOutAfterFee);
		});
	});

	describe('burnETHmx', function () {
		const amountEth = parseEther('10');
		const ethSent = amountEth.mul(6).div(10);
		const amountEthmx = amountEth.mul(2);
		const amountEthtx = ethToEthtx(baseGasPrice, amountEth);

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
				const { contract, ethmx, ethmxMinter } = fixture;
				await ethmxMinter.mint({ value: amountEth });
				await ethmx.approve(contract.address, amountEthmx);
			});

			it('should burn ETHmx from account', async function () {
				const { deployer, contract, ethmx } = fixture;

				await expect(contract.burnETHmx(amountEthmx, false))
					.to.emit(ethmx, 'Transfer')
					.withArgs(contract.address, zeroAddress, amountEthmx);

				expect(await ethmx.balanceOf(deployer)).to.eq(0);
			});

			it('should burn correct amount of ETHtx', async function () {
				const { deployer, contract, ethtx } = fixture;

				await expect(contract.burnETHmx(amountEthmx, false))
					.to.emit(ethtx, 'Transfer')
					.withArgs(contract.address, zeroAddress, amountEthtx);

				expect(await ethtx.balanceOf(deployer)).to.eq(0);
			});

			it('should send correct amount of WETH', async function () {
				const { deployer, contract, weth } = fixture;

				await expect(contract.burnETHmx(amountEthmx, true))
					.to.emit(weth, 'Transfer')
					.withArgs(contract.address, deployer, ethSent);

				expect(await weth.balanceOf(deployer)).to.eq(ethSent);
			});

			it('should send correct amount of ETH', async function () {
				const { deployerSigner, contract } = fixture;

				const prevBalance = await deployerSigner.getBalance();

				const tx = await contract.burnETHmx(amountEthmx, false);
				const ethSpent = await ethUsedOnGas(tx);

				const expected = prevBalance.sub(ethSpent).add(ethSent);

				expect(await deployerSigner.getBalance()).to.eq(expected);
			});

			it('should correctly update geth', async function () {
				const { contract } = fixture;

				await contract.burnETHmx(amountEthmx, true);

				expect(await contract.ethSupply(), 'contract balance mismatch').to.eq(
					parseEther('4'),
				);
				expect(await contract.geth()).to.eq(parseEther('4'));
			});

			it('should emit BurnedETHmx event', async function () {
				const { deployer, contract } = fixture;

				await expect(contract.burnETHmx(amountEthmx, false))
					.to.emit(contract, 'BurnedETHmx')
					.withArgs(deployer, amountEthmx);
			});

			it('should revert on zero amount', async function () {
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

			it('should revert when not enough ETHtx', async function () {
				const { contract } = fixture;
				const deadline = Math.floor(Date.now() / 1000) + 3600;

				await contract.swapEthForEthtx(deadline, { value: parseEther('1') });

				await expect(
					contract.burnETHmx(amountEthmx, false),
				).to.be.revertedWith('ETHtx::_burn: amount exceeds balance');
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
				const { contract, ethmx, ethmxMinter, testerSigner } = fixture;
				await ethmxMinter.mint({ value: amountEth });
				await ethmxMinter.connect(testerSigner).mint({ value: amountEth });
				await ethmx.approve(contract.address, amountEthmx);
				await ethmx
					.connect(testerSigner)
					.approve(contract.address, amountEthmx);
			});

			it('should burn correct amount of ETHtx', async function () {
				const { deployer, tester, contract, ethtx, testerContract } = fixture;

				await expect(contract.burnETHmx(amountEthmx, false))
					.to.emit(ethtx, 'Transfer')
					.withArgs(contract.address, zeroAddress, amountEthtx);

				expect(
					await ethtx.balanceOf(deployer),
					'deployer balance mismatch',
				).to.eq(0);

				expect(
					await ethtx.balanceOf(contract.address),
					'contract balance mismatch before second burn',
				).to.eq(amountEthtx);

				await expect(testerContract.burnETHmx(amountEthmx, false))
					.to.emit(ethtx, 'Transfer')
					.withArgs(contract.address, zeroAddress, amountEthtx);

				expect(await ethtx.balanceOf(tester), 'tester balance mismatch').to.eq(
					0,
				);
				expect(
					await ethtx.balanceOf(contract.address),
					'contract final balance mismatch',
				).to.eq(0);
			});

			it('should send correct amount of WETH', async function () {
				const { deployer, tester, contract, testerContract, weth } = fixture;

				await contract.burnETHmx(amountEthmx, true);
				expect(
					await weth.balanceOf(deployer),
					'deployer balance mismatch',
				).to.eq(ethSent);

				expect(await contract.geth(), 'contract geth mismatch').to.eq(
					parseEther('4'),
				);

				await testerContract.burnETHmx(amountEthmx, true);
				expect(await weth.balanceOf(tester), 'tester balance mismatch').to.eq(
					ethSent,
				);

				expect(
					await weth.balanceOf(contract.address),
					'contract balance mismatch',
				).to.eq(parseEther('8'));

				expect(await contract.geth(), 'contract second geth mismatch').to.eq(
					parseEther('8'),
				);
			});

			it('should send correct WETH after minting', async function () {
				const {
					deployer,
					tester,
					contract,
					ethmxMinter,
					testerContract,
					weth,
					ethmx,
				} = fixture;

				await contract.burnETHmx(amountEthmx, true);
				expect(
					await weth.balanceOf(deployer),
					'deployer balance mismatch',
				).to.eq(ethSent);

				await ethmxMinter.mint({ value: amountEth });

				await testerContract.burnETHmx(amountEthmx, true);
				expect(await weth.balanceOf(tester), 'tester balance mismatch').to.eq(
					ethSent,
				);

				expect(
					await weth.balanceOf(contract.address),
					'contract balance mismatch',
				).to.eq(parseEther('18'));

				expect(await contract.geth(), 'contract geth mismatch').to.eq(
					parseEther('8'),
				);

				await ethmx.approve(contract.address, amountEthmx);
				await contract.burnETHmx(amountEthmx, true);
				expect(
					await weth.balanceOf(deployer),
					'deployer second balance mismatch',
				).to.eq(ethSent.mul(2));

				expect(
					await weth.balanceOf(contract.address),
					'contract second balance mismatch',
				).to.eq(parseEther('12'));

				expect(await contract.geth(), 'contract second geth mismatch').to.eq(
					parseEther('12'),
				);
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

		it('should revert on ETHtx', async function () {
			const { contract, tester, ethtx } = fixture;

			await expect(
				contract.recoverUnsupportedERC20(ethtx.address, tester, 1),
			).to.be.revertedWith('cannot recover ETHtx');
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

	describe('swapEthtxForEth', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 3600;
			const amountETHtx = parseETHtx('100');
			await expect(
				contract.swapEthtxForEth(amountETHtx, deadline, true),
			).to.be.revertedWith('expired');
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			const amountETHtx = parseETHtx('100');

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(
				contract.swapEthtxForEth(amountETHtx, deadline, true),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should transfer correct ETHtx amount to contract', async function () {
			const { contract, deployer, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const contractETHtx = amountETHtx.sub(fee);
			const amountETH = ethtxToEth(defaultGasPrice, contractETHtx);

			await ethtx.mockMint(deployer, amountETHtx.add(1));
			await addWETH(fixture, amountETH);
			await ethtx.increaseAllowance(contract.address, amountETHtx);

			await expect(contract.swapEthtxForEth(amountETHtx, deadline, true))
				.to.emit(ethtx, 'Transfer')
				.withArgs(deployer, contract.address, contractETHtx);

			expect(
				await ethtx.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(contractETHtx);

			expect(
				await ethtx.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(1);
		});

		it('should transfer correct ETHtx amount to fee recipient', async function () {
			const { contract, deployer, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const contractETHtx = amountETHtx.sub(fee);
			const amountETH = ethtxToEth(defaultGasPrice, contractETHtx);

			await ethtx.mockMint(deployer, amountETHtx);
			await addWETH(fixture, amountETH);
			await ethtx.increaseAllowance(contract.address, amountETHtx);

			await expect(contract.swapEthtxForEth(amountETHtx, deadline, true))
				.to.emit(ethtx, 'Transfer')
				.withArgs(deployer, feeRecipient, fee);

			expect(
				await ethtx.balanceOf(feeRecipient),
				'fee recipient ETHtx balance mismatch',
			).to.eq(fee);
		});

		it('should transfer correct WETH', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);

			const ethRequired = targetETH(ethtxToEth(defaultGasPrice, amountETHtx));
			const ethReturned = ethtxToEth(defaultGasPrice, amountETHtx.sub(fee));

			await ethtx.mockMint(deployer, amountETHtx);
			await addWETH(fixture, ethRequired);
			await ethtx.increaseAllowance(contract.address, amountETHtx);

			await expect(contract.swapEthtxForEth(amountETHtx, deadline, true))
				.to.emit(weth, 'Transfer')
				.withArgs(contract.address, deployer, ethReturned);

			expect(
				await weth.balanceOf(deployer),
				'deployer WETH balance mismatch',
			).to.eq(ethReturned);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(ethRequired.sub(ethReturned));
		});

		it('should transfer correct ETH', async function () {
			const { contract, deployer, deployerSigner, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);

			const ethRequired = targetETH(ethtxToEth(defaultGasPrice, amountETHtx));
			const ethReturned = ethtxToEth(defaultGasPrice, amountETHtx.sub(fee));

			await ethtx.mockMint(deployer, amountETHtx);
			await addWETH(fixture, ethRequired);
			await ethtx.increaseAllowance(contract.address, amountETHtx);

			const balanceBefore = await deployerSigner.getBalance();

			const tx = await contract.swapEthtxForEth(amountETHtx, deadline, false);

			const gasUsed = await ethUsedOnGas(tx);
			const balanceAfter = await deployerSigner.getBalance();

			expect(
				balanceAfter.sub(balanceBefore),
				'deployer ETH balance mismatch',
			).to.eq(ethReturned.sub(gasUsed));

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(ethRequired.sub(ethReturned));
		});

		it('should transfer correct WETH when maxGasPrice < gasPrice', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);

			const ethRequired = targetETH(
				ethtxToEth(defaultGasPrice, amountETHtx),
			).div(2);
			const ethReturned = ethtxToEth(
				defaultGasPrice,
				amountETHtx.sub(fee),
			).div(2);

			await ethtx.mockMint(deployer, amountETHtx);
			await addWETH(fixture, ethRequired);
			await ethtx.increaseAllowance(contract.address, amountETHtx);

			expect(await contract.maxGasPrice(), 'maxGasPrice mismatch').to.eq(
				defaultGasPrice.div(2),
			);

			await expect(contract.swapEthtxForEth(amountETHtx, deadline, true))
				.to.emit(weth, 'Transfer')
				.withArgs(contract.address, deployer, ethReturned);

			expect(
				await weth.balanceOf(deployer),
				'deployer WETH balance mismatch',
			).to.eq(ethReturned);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(ethRequired.sub(ethReturned));
		});

		it('should transfer 1 weiETHtx', async function () {
			const { contract, deployer, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = One;

			await ethtx.mockMint(deployer, amountETHtx);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, amountETHtx);

			await expect(contract.swapEthtxForEth(amountETHtx, deadline, true))
				.to.emit(ethtx, 'Transfer')
				.withArgs(deployer, contract.address, 1);
		});

		it('should revert on zero', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			await expect(
				contract.swapEthtxForEth(0, deadline, true),
			).to.be.revertedWith('cannot swap zero');
		});

		it('should transfer back zero WETH with 1 weiETHtx', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = One;

			await ethtx.mockMint(deployer, amountETHtx);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, amountETHtx);

			await expect(contract.swapEthtxForEth(amountETHtx, deadline, true))
				.to.emit(weth, 'Transfer')
				.withArgs(contract.address, deployer, 0);
		});

		it('should transfer back zero WETH with 244 weiETHtx', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = 244;

			await ethtx.mockMint(deployer, amountETHtx);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, amountETHtx);

			await expect(contract.swapEthtxForEth(amountETHtx, deadline, true))
				.to.emit(weth, 'Transfer')
				.withArgs(contract.address, deployer, 0);
		});

		it('should transfer back one wei with 245 weiETHtx', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = 245;

			await ethtx.mockMint(deployer, amountETHtx);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, amountETHtx);

			await expect(contract.swapEthtxForEth(amountETHtx, deadline, true))
				.to.emit(weth, 'Transfer')
				.withArgs(contract.address, deployer, 1);
		});
	});

	describe('swapEthtxForExactEth', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 3600;
			const amountETHtx = parseETHtx('100');
			const amountETH = parseEther('1');
			await expect(
				contract.swapEthtxForExactEth(amountETHtx, amountETH, deadline, true),
			).to.be.revertedWith('expired');
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			const amountETHtx = parseETHtx('100');
			const amountETH = parseEther('1');

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(
				contract.swapEthtxForExactEth(amountETHtx, amountETH, deadline, true),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert when ETHtx amountIn > amountInMax', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const amountETH = parseEther('1');
			await expect(
				contract.swapEthtxForExactEth(amountETHtx, amountETH, deadline, true),
			).to.be.revertedWith('amountIn exceeds max');
		});

		describe('should transfer', function () {
			let deadline: number;
			const ethOut = parseEther('1');
			const ethtxIn = undoFee(ethToEthtx(defaultGasPrice, ethOut));
			const fee = calcFee(ethtxIn);
			const contractETHtx = ethtxIn.sub(fee);
			const ethSupply = targetETH(undoFee(ethOut)).add(1);
			const ethtxLeft = 1;

			before(function () {
				expect(
					maxGasPrice(ethSupply, ethtxIn.add(ethtxLeft)),
					'maxGasPrice mismatch',
				).to.eq(defaultGasPrice);
			});

			beforeEach(async function () {
				const { contract, ethtx, deployer } = fixture;
				deadline = Math.floor(Date.now() / 1000) + 3600;

				await ethtx.mockMint(deployer, ethtxIn.add(ethtxLeft));
				await addWETH(fixture, ethSupply);
				await ethtx.increaseAllowance(contract.address, ethtxIn);
			});

			it('correct ETHtx amount to contract', async function () {
				const { contract, deployer, ethtx } = fixture;

				await expect(
					contract.swapEthtxForExactEth(ethtxIn, ethOut, deadline, true),
				)
					.to.emit(ethtx, 'Transfer')
					.withArgs(deployer, contract.address, contractETHtx);

				expect(
					await ethtx.balanceOf(contract.address),
					'contract ETHtx balance mismatch',
				).to.eq(contractETHtx);

				expect(
					await ethtx.balanceOf(deployer),
					'deployer ETHtx balance mismatch',
				).to.eq(ethtxLeft);
			});

			it('correct ETHtx amount to fee recipient', async function () {
				const { contract, deployer, ethtx } = fixture;

				await expect(
					contract.swapEthtxForExactEth(ethtxIn, ethOut, deadline, true),
				)
					.to.emit(ethtx, 'Transfer')
					.withArgs(deployer, feeRecipient, fee);

				expect(
					await ethtx.balanceOf(feeRecipient),
					'fee recipient ETHtx balance mismatch',
				).to.eq(fee);
			});

			it('correct WETH amount', async function () {
				const { contract, deployer, weth } = fixture;

				await expect(
					contract.swapEthtxForExactEth(ethtxIn, ethOut, deadline, true),
				)
					.to.emit(weth, 'Transfer')
					.withArgs(contract.address, deployer, ethOut);

				expect(
					await weth.balanceOf(deployer),
					'deployer WETH balance mismatch',
				).to.eq(ethOut);

				expect(
					await weth.balanceOf(contract.address),
					'contract WETH balance mismatch',
				).to.eq(ethSupply.sub(ethOut));
			});

			it('correct ETH amount', async function () {
				const { contract, deployerSigner, weth } = fixture;

				const balanceBefore = await deployerSigner.getBalance();

				const tx = await contract.swapEthtxForExactEth(
					ethtxIn,
					ethOut,
					deadline,
					false,
				);

				const gasUsed = await ethUsedOnGas(tx);
				const balanceAfter = await deployerSigner.getBalance();

				expect(
					balanceAfter.sub(balanceBefore),
					'deployer ETH balance mismatch',
				).to.eq(ethOut.sub(gasUsed));

				expect(
					await weth.balanceOf(contract.address),
					'contract WETH balance mismatch',
				).to.eq(ethSupply.sub(ethOut));
			});
		});

		it('should transfer correct ETHtx when maxGasPrice < gasPrice', async function () {
			const { contract, deployer, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const ethSupply = parseEther('10');
			const ethtxOutstanding = targetETHtx(ethSupply).mul(2);
			const maxPrice = maxGasPrice(ethSupply, ethtxOutstanding);

			expect(maxPrice, 'maxGasPrice too large').to.be.lt(defaultGasPrice);

			const ethOut = parseEther('1');
			const ethtxIn = undoFee(ethToEthtx(maxPrice, ethOut));
			const fee = calcFee(ethtxIn);
			const contractETHtx = ethtxIn.sub(fee);
			const ethtxLeft = ethtxOutstanding.sub(ethtxIn);

			await ethtx.mockMint(deployer, ethtxOutstanding);
			await addWETH(fixture, ethSupply);
			await ethtx.increaseAllowance(contract.address, ethtxIn);

			await expect(
				contract.swapEthtxForExactEth(ethtxIn, ethOut, deadline, true),
			)
				.to.emit(ethtx, 'Transfer')
				.withArgs(deployer, contract.address, contractETHtx);

			expect(
				await ethtx.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(contractETHtx);

			expect(
				await ethtx.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(ethtxLeft);
		});

		it('should transfer 1 wei worth of ETHtx', async function () {
			const { contract, deployer, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethOut = One;
			const ethtxIn = undoFee(ethToEthtx(defaultGasPrice, ethOut));
			const fee = calcFee(ethtxIn);

			expect(ethtxIn, 'ethtxIn mismatch').to.eq(244);

			await ethtx.mockMint(deployer, ethtxIn);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, ethtxIn);

			await expect(
				contract.swapEthtxForExactEth(ethtxIn, ethOut, deadline, true),
			)
				.to.emit(ethtx, 'Transfer')
				.withArgs(deployer, contract.address, ethtxIn.sub(fee));
		});

		it('should transfer back 1 wei', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethOut = One;
			const ethtxIn = undoFee(ethToEthtx(defaultGasPrice, ethOut));

			await ethtx.mockMint(deployer, ethtxIn);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, ethtxIn);

			await expect(
				contract.swapEthtxForExactEth(ethtxIn, ethOut, deadline, true),
			)
				.to.emit(weth, 'Transfer')
				.withArgs(contract.address, deployer, ethOut);
		});

		it('should revert on zero', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			await expect(
				contract.swapEthtxForExactEth(0, 1, deadline, true),
			).to.be.revertedWith('cannot swap zero');
		});

		it('should revert with 243 weiETHtx : 1 wei', async function () {
			const { contract, deployer, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethOut = One;
			const ethtxIn = 243;

			await ethtx.mockMint(deployer, ethtxIn);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, ethtxIn);

			await expect(
				contract.swapEthtxForExactEth(ethtxIn, ethOut, deadline, true),
			).to.be.revertedWith('amountIn exceeds max');
		});

		it('should succeed with 244 weiETHtx : 1 wei', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethOut = One;
			const ethtxIn = 244;

			await ethtx.mockMint(deployer, ethtxIn);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, ethtxIn);

			await expect(
				contract.swapEthtxForExactEth(ethtxIn, ethOut, deadline, true),
			)
				.to.emit(weth, 'Transfer')
				.withArgs(contract.address, deployer, ethOut);
		});
	});

	describe('swapExactEthtxForEth', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 3600;
			const amountETHtx = parseETHtx('100');
			const amountETH = parseEther('1');
			await expect(
				contract.swapExactEthtxForEth(amountETHtx, amountETH, deadline, true),
			).to.be.revertedWith('expired');
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			const amountETHtx = parseETHtx('100');
			const amountETH = parseEther('1');

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(
				contract.swapExactEthtxForEth(amountETHtx, amountETH, deadline, true),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert when ETH amountOut < amountOutMin', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const ethtxIn = parseETHtx('1');
			const ethOut = parseEther('1');
			await expect(
				contract.swapExactEthtxForEth(ethtxIn, ethOut, deadline, true),
			).to.be.revertedWith('amountOut below min');
		});

		describe('should transfer', function () {
			let deadline: number;
			const ethtxIn = parseETHtx('100');
			const fee = calcFee(ethtxIn);
			const contractETHtx = ethtxIn.sub(fee);
			const ethOut = ethtxToEth(defaultGasPrice, contractETHtx);
			const ethSupply = targetETH(ethtxToEth(defaultGasPrice, ethtxIn)).add(1);
			const ethtxLeft = 1;

			before(function () {
				expect(
					maxGasPrice(ethSupply, ethtxIn.add(ethtxLeft)),
					'maxGasPrice mismatch',
				).to.eq(defaultGasPrice);
			});

			beforeEach(async function () {
				const { contract, deployer, ethtx } = fixture;
				deadline = Math.floor(Date.now() / 1000) + 3600;

				await ethtx.mockMint(deployer, ethtxIn.add(ethtxLeft));
				await addWETH(fixture, ethSupply);
				await ethtx.increaseAllowance(contract.address, ethtxIn);
			});

			it('correct ETHtx amount to contract', async function () {
				const { contract, deployer, ethtx } = fixture;

				await expect(
					contract.swapExactEthtxForEth(ethtxIn, ethOut, deadline, true),
				)
					.to.emit(ethtx, 'Transfer')
					.withArgs(deployer, contract.address, contractETHtx);

				expect(
					await ethtx.balanceOf(contract.address),
					'contract ETHtx balance mismatch',
				).to.eq(contractETHtx);

				expect(
					await ethtx.balanceOf(deployer),
					'deployer ETHtx balance mismatch',
				).to.eq(ethtxLeft);
			});

			it('correct ETHtx amount to fee recipient', async function () {
				const { contract, deployer, ethtx } = fixture;

				await expect(
					contract.swapExactEthtxForEth(ethtxIn, ethOut, deadline, true),
				)
					.to.emit(ethtx, 'Transfer')
					.withArgs(deployer, feeRecipient, fee);

				expect(
					await ethtx.balanceOf(feeRecipient),
					'fee recipient ETHtx balance mismatch',
				).to.eq(fee);
			});

			it('correct WETH', async function () {
				const { contract, deployer, weth } = fixture;

				await expect(
					contract.swapExactEthtxForEth(ethtxIn, ethOut, deadline, true),
				)
					.to.emit(weth, 'Transfer')
					.withArgs(contract.address, deployer, ethOut);

				expect(
					await weth.balanceOf(deployer),
					'deployer WETH balance mismatch',
				).to.eq(ethOut);

				expect(
					await weth.balanceOf(contract.address),
					'contract WETH balance mismatch',
				).to.eq(ethSupply.sub(ethOut));
			});

			it('correct ETH amount', async function () {
				const { contract, deployerSigner, weth } = fixture;

				const balanceBefore = await deployerSigner.getBalance();

				const tx = await contract.swapExactEthtxForEth(
					ethtxIn,
					ethOut,
					deadline,
					false,
				);

				const gasUsed = await ethUsedOnGas(tx);
				const balanceAfter = await deployerSigner.getBalance();

				expect(
					balanceAfter.sub(balanceBefore),
					'deployer ETH balance mismatch',
				).to.eq(ethOut.sub(gasUsed));

				expect(
					await weth.balanceOf(contract.address),
					'contract WETH balance mismatch',
				).to.eq(ethSupply.sub(ethOut));
			});
		});

		it('should transfer correct WETH when maxGasPrice < gasPrice', async function () {
			const { contract, deployer, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const ethSupply = parseEther('10');
			const ethtxOutstanding = targetETHtx(ethSupply).mul(2);
			const maxPrice = maxGasPrice(ethSupply, ethtxOutstanding);

			expect(maxPrice, 'maxGasPrice too large').to.be.lt(defaultGasPrice);

			const ethtxIn = parseETHtx('100');
			const fee = calcFee(ethtxIn);
			const contractETHtx = ethtxIn.sub(fee);
			const ethOut = ethtxToEth(maxPrice, contractETHtx);
			const ethtxLeft = ethtxOutstanding.sub(ethtxIn);

			await ethtx.mockMint(deployer, ethtxOutstanding);
			await addWETH(fixture, ethSupply);
			await ethtx.increaseAllowance(contract.address, ethtxIn);

			await expect(
				contract.swapExactEthtxForEth(ethtxIn, ethOut, deadline, true),
			)
				.to.emit(ethtx, 'Transfer')
				.withArgs(deployer, contract.address, contractETHtx);

			expect(
				await ethtx.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(contractETHtx);

			expect(
				await ethtx.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(ethtxLeft);
		});

		it('should revert on zero', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			await expect(
				contract.swapExactEthtxForEth(0, 1, deadline, true),
			).to.be.revertedWith('cannot swap zero');
		});

		it('should revert on 1 wei : 1 weiETHtx', async function () {
			const { contract, deployer, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethtxIn = One;
			const ethOut = One;
			await ethtx.mockMint(deployer, ethtxIn);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, ethtxIn);

			await expect(
				contract.swapExactEthtxForEth(ethtxIn, ethOut, deadline, true),
			).to.be.revertedWith('amountOut below min');
		});

		it('should revert on 1 wei : 244 weiETHtx', async function () {
			const { contract, deployer, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethtxIn = 244;
			const ethOut = One;
			await ethtx.mockMint(deployer, ethtxIn);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, ethtxIn);

			await expect(
				contract.swapExactEthtxForEth(ethtxIn, ethOut, deadline, true),
			).to.be.revertedWith('amountOut below min');
		});

		it('should succeed with 1 wei : 245 weiETHtx', async function () {
			const { contract, deployer, ethtx, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethtxIn = 245;
			const ethOut = One;

			await ethtx.mockMint(deployer, ethtxIn);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, ethtxIn);

			await expect(
				contract.swapExactEthtxForEth(ethtxIn, ethOut, deadline, true),
			)
				.to.emit(weth, 'Transfer')
				.withArgs(contract.address, deployer, ethOut);
		});

		it('should transfer 1 weiETHtx', async function () {
			const { contract, deployer, ethtx } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const ethtxIn = One;
			const ethOut = 0;
			await ethtx.mockMint(deployer, ethtxIn);
			await addWETH(fixture, parseEther('10'));
			await ethtx.increaseAllowance(contract.address, ethtxIn);

			await expect(
				contract.swapExactEthtxForEth(ethtxIn, ethOut, deadline, true),
			)
				.to.emit(ethtx, 'Transfer')
				.withArgs(deployer, contract.address, 1);
		});
	});

	describe('setEthmx', function () {
		const newAddress = zeroPadAddress('0x3');

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setEthmx(newAddress)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should revert when set to zero address', async function () {
			const { contract } = fixture;
			await expect(contract.setEthmx(zeroAddress)).to.be.revertedWith(
				'ETHmx zero address',
			);
		});

		it('should set ETHmx address', async function () {
			const { contract } = fixture;
			await contract.setEthmx(newAddress);
			expect(await contract.ethmx()).to.eq(newAddress);
		});

		it('should emit ETHmxSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setEthmx(newAddress))
				.to.emit(contract, 'ETHmxSet')
				.withArgs(deployer, newAddress);
		});
	});

	describe('setEthtx', function () {
		const newAddress = zeroPadAddress('0x3');

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setEthtx(newAddress)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should revert when set to zero address', async function () {
			const { contract } = fixture;
			await expect(contract.setEthtx(zeroAddress)).to.be.revertedWith(
				'ETHtx zero address',
			);
		});

		it('should set ETHtx address', async function () {
			const { contract } = fixture;
			await contract.setEthtx(newAddress);
			expect(await contract.ethtx()).to.eq(newAddress);
		});

		it('should emit ETHtxSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setEthtx(newAddress))
				.to.emit(contract, 'ETHtxSet')
				.withArgs(deployer, newAddress);
		});
	});

	describe('setGasOracle', function () {
		const newOracle = zeroPadAddress('0x3');

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setGasOracle(newOracle)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should revert when set to zero address', async function () {
			const { contract } = fixture;
			await expect(contract.setGasOracle(zeroAddress)).to.be.revertedWith(
				'gasOracle zero address',
			);
		});

		it('should set gasOracle address', async function () {
			const { contract } = fixture;
			await contract.setGasOracle(newOracle);
			expect(await contract.gasOracle()).to.eq(newOracle);
		});

		it('should emit GasOracleSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setGasOracle(newOracle))
				.to.emit(contract, 'GasOracleSet')
				.withArgs(deployer, newOracle);
		});
	});

	describe('setGeth', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setGeth(0)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should set geth', async function () {
			const { contract } = fixture;
			await contract.setGeth(1);
			expect(await contract.geth()).to.eq(1);
		});

		it('should emit GethSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setGeth(2))
				.to.emit(contract, 'GethSet')
				.withArgs(deployer, 2);
		});
	});

	describe('setTargetCRatio', function () {
		const newNum = 12;
		const newDen = 7;

		before(function () {
			expect(newNum, 'numerator will not change').to.not.eq(
				targetCRatioNumerator,
			);
			expect(newDen, 'denominator will not change').to.not.eq(
				targetCRatioDenominator,
			);
		});

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(
				testerContract.setTargetCRatio(newNum, newDen),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should revert if numerator is zero', async function () {
			const { contract } = fixture;
			await expect(contract.setTargetCRatio(0, newDen)).to.be.revertedWith(
				'targetCRatio numerator is zero',
			);
		});

		it('should revert if denominator is zero', async function () {
			const { contract } = fixture;
			await expect(contract.setTargetCRatio(newNum, 0)).to.be.revertedWith(
				'targetCRatio denominator is zero',
			);
		});

		it('should set targetCRatio', async function () {
			const { contract } = fixture;
			await contract.setTargetCRatio(newNum, newDen);
			const [num, den] = await contract.targetCRatio();
			expect(num, 'numerator mismatch').to.eq(newNum);
			expect(den, 'denominator mismatch').to.eq(newDen);
		});

		it('should emit TargetCRatioSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setTargetCRatio(newNum, newDen))
				.to.emit(contract, 'TargetCRatioSet')
				.withArgs(deployer, newNum, newDen);
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
