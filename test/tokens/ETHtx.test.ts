import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseEther, keccak256, toUtf8Bytes } from 'ethers/lib/utils';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { JsonRpcSigner } from '@ethersproject/providers';

import { zeroAddress, zeroPadAddress } from '../helpers/address';
import {
	parseGwei,
	parseETHtx,
	ethToEthtx,
	ethtxToEth,
	sendWETH,
	GAS_PER_ETHTX,
	ethUsedOnGas,
} from '../helpers/conversions';
import {
	ETHmx,
	ETHmx__factory,
	MockETHtx,
	MockETHtx__factory,
	FeeLogic__factory,
	WETH9__factory,
	MockGasPrice,
	MockGasPrice__factory,
	WETH9,
	FeeLogic,
} from '../../build/types/ethers-v5';

const contractName = 'ETHtx';

const defaultGasPrice = parseGwei('200');
const mintGasPrice = parseGwei('1800');
const roiNumerator = 5;
const roiDenominator = 1;
const feeRecipient = zeroPadAddress('0x1');
const targetCRatioNumerator = 2;
const targetCRatioDenominator = 1;
const feeNumerator = 75;
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
	contract: MockETHtx;
	testerContract: MockETHtx;
	ethmx: ETHmx;
	feeLogic: FeeLogic;
	oracle: MockGasPrice;
	weth: WETH9;
}

const loadFixture = deployments.createFixture(
	async ({ getNamedAccounts, waffle }) => {
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const feeLogic = await new FeeLogic__factory(deployerSigner).deploy(
			feeRecipient,
			feeNumerator,
			feeDenominator,
		);

		const oracle = await new MockGasPrice__factory(deployerSigner).deploy(
			oracleUpdateInterval,
			defaultGasPrice,
		);
		await oracle.grantRole(oracleRole, deployer);

		const weth = await new WETH9__factory(deployerSigner).deploy();

		const contract = await new MockETHtx__factory(deployerSigner).deploy(
			feeLogic.address,
			oracle.address,
			zeroAddress, // ethmx address
			weth.address,
			targetCRatioNumerator,
			targetCRatioDenominator,
		);

		const ethmx = await new ETHmx__factory(deployerSigner).deploy(
			contract.address,
			weth.address,
			mintGasPrice,
			roiNumerator,
			roiDenominator,
		);

		await contract.setMinter(ethmx.address);
		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			testerContract,
			ethmx,
			feeLogic,
			oracle,
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
			const { contract, deployer, ethmx, oracle, weth } = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);

			expect(await contract.gasOracle(), 'gas oracle address mismatch').to.eq(
				oracle.address,
			);

			expect(await contract.minter(), 'minter address mismatch').to.eq(
				ethmx.address,
			);

			const [targetCRatioNum, targetCRatioDen] = await contract.targetCRatio();
			expect(targetCRatioNum, 'targetCRatio numerator mismatch').to.eq(
				targetCRatioNumerator,
			);
			expect(targetCRatioDen, 'targetCRatio denominator mismatch').to.eq(
				targetCRatioDenominator,
			);

			expect(await contract.wethAddr(), 'WETH address mismatch').to.eq(
				weth.address,
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
			const { contract, tester } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);

			const ethOutstanding = parseEther('5');
			const amountETHtx = ethToEthtx(defaultGasPrice, ethOutstanding);
			await contract.mockMint(tester, amountETHtx);

			const [num, den] = await contract.cRatio();
			expect(num, 'cRatio numerator mismatch').to.eq(ethSupply);
			expect(den, 'cRatio denominator mismatch').to.eq(ethOutstanding.sub(1));
		});
	});

	describe('cRatioBelowTarget', function () {
		it('should be false when denominator is zero', async function () {
			const { contract } = fixture;
			expect(await contract.cRatioBelowTarget()).to.be.false;
		});

		it('should be false when cRatio > targetCRatio', async function () {
			const { contract, tester } = fixture;
			const ethtxOutstanding = ethToEthtx(defaultGasPrice, parseEther('10'));
			const ethOutstanding = ethtxToEth(defaultGasPrice, ethtxOutstanding);
			const ethSupply = targetETH(ethOutstanding).add(1);

			await addWETH(fixture, ethSupply);
			await contract.mockMint(tester, ethtxOutstanding);

			expect(await contract.cRatioBelowTarget()).to.be.false;
		});

		it('should be false when cRatio == targetCRatio', async function () {
			const { contract, tester } = fixture;
			const ethtxOutstanding = ethToEthtx(defaultGasPrice, parseEther('10'));
			const ethOutstanding = ethtxToEth(defaultGasPrice, ethtxOutstanding);
			const ethSupply = targetETH(ethOutstanding);

			await addWETH(fixture, ethSupply);
			await contract.mockMint(tester, ethtxOutstanding);

			expect(await contract.cRatioBelowTarget()).to.be.false;
		});

		it('should be true when cRatio < targetCRatio', async function () {
			const { contract, tester } = fixture;
			const ethtxOutstanding = ethToEthtx(defaultGasPrice, parseEther('10'));
			const ethOutstanding = ethtxToEth(defaultGasPrice, ethtxOutstanding);
			const ethSupply = targetETH(ethOutstanding).sub(1);

			await addWETH(fixture, ethSupply);
			await contract.mockMint(tester, ethtxOutstanding);

			expect(await contract.cRatioBelowTarget()).to.be.true;
		});
	});

	describe('ethForEthtx', function () {
		it('should be correct', async function () {
			const { contract } = fixture;
			const amountETHtx = parseETHtx('100');
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx);
			expect(await contract.ethForEthtx(amountETHtx)).to.eq(amountETH);
		});

		it('should change with gas price', async function () {
			const { contract, oracle } = fixture;

			const gasPrice = parseGwei('100');
			expect(gasPrice, 'gas price will not change').to.not.eq(defaultGasPrice);
			await oracle.setGasPrice(gasPrice);

			const amountETHtx = parseETHtx('100');
			const amountETH = ethtxToEth(gasPrice, amountETHtx);
			expect(await contract.ethForEthtx(amountETHtx)).to.eq(amountETH);
		});
	});

	describe('ethFromEthtxAtRedemption', function () {
		it('should be correct', async function () {
			const { contract } = fixture;

			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx.sub(fee));

			expect(await contract.ethFromEthtxAtRedemption(amountETHtx)).to.eq(
				amountETH,
			);
		});

		it('should change with gas price', async function () {
			const { contract, oracle } = fixture;

			const gasPrice = parseGwei('100');
			expect(gasPrice, 'gas price will not change').to.not.eq(defaultGasPrice);
			await oracle.setGasPrice(gasPrice);

			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const amountETH = ethtxToEth(gasPrice, amountETHtx.sub(fee));

			expect(await contract.ethFromEthtxAtRedemption(amountETHtx)).to.eq(
				amountETH,
			);
		});

		it('should use maxGasPrice cap', async function () {
			const { contract, oracle, tester } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);
			const ethtxOutstanding = ethToEthtx(
				defaultGasPrice,
				targetETH(ethSupply),
			);
			await contract.mockMint(tester, ethtxOutstanding);

			const maxGasPrice = await contract.maxGasPrice();
			const gasPrice = maxGasPrice.add(parseGwei('200'));
			await oracle.setGasPrice(gasPrice);

			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const amountETH = ethtxToEth(maxGasPrice, amountETHtx.sub(fee));

			expect(await contract.ethFromEthtxAtRedemption(amountETHtx)).to.eq(
				amountETH,
			);
		});
	});

	describe('ethtxFromEth', function () {
		it('should be correct', async function () {
			const { contract } = fixture;
			const amountETH = parseEther('10');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH);
			expect(await contract.ethtxFromEth(amountETH)).to.eq(amountETHtx);
		});

		it('should change with gas price', async function () {
			const { contract, oracle } = fixture;

			const gasPrice = parseGwei('100');
			expect(gasPrice, 'gas price will not change').to.not.eq(defaultGasPrice);
			await oracle.setGasPrice(gasPrice);

			const amountETH = parseEther('10');
			const amountETHtx = ethToEthtx(gasPrice, amountETH);
			expect(await contract.ethtxFromEth(amountETH)).to.eq(amountETHtx);
		});
	});

	describe('ethtxForEthAtRedemption', function () {
		it('should be correct', async function () {
			const { contract } = fixture;

			const amountETH = parseEther('10');
			const amountETHtx = undoFee(ethToEthtx(defaultGasPrice, amountETH));

			expect(await contract.ethtxForEthAtRedemption(amountETH)).to.eq(
				amountETHtx,
			);
		});

		it('should change with gas price', async function () {
			const { contract, oracle } = fixture;

			const gasPrice = parseGwei('100');
			expect(gasPrice, 'gas price will not change').to.not.eq(defaultGasPrice);
			await oracle.setGasPrice(gasPrice);

			const amountETH = parseEther('10');
			const amountETHtx = undoFee(ethToEthtx(gasPrice, amountETH));

			expect(await contract.ethtxForEthAtRedemption(amountETH)).to.eq(
				amountETHtx,
			);
		});

		it('should use maxGasPrice cap', async function () {
			const { contract, oracle, tester } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);
			const ethtxOutstanding = ethToEthtx(
				defaultGasPrice,
				targetETH(ethSupply),
			);
			await contract.mockMint(tester, ethtxOutstanding);

			const maxGasPrice = await contract.maxGasPrice();
			const gasPrice = maxGasPrice.add(parseGwei('200'));
			await oracle.setGasPrice(gasPrice);

			const amountETH = parseEther('10');
			const amountETHtx = undoFee(ethToEthtx(maxGasPrice, amountETH));

			expect(await contract.ethtxForEthAtRedemption(amountETH)).to.eq(
				amountETHtx,
			);
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

	describe('ethtxAvailable', function () {
		it('should reflect contract ETHtx balance', async function () {
			const { contract } = fixture;
			const amount = parseETHtx('100');
			await contract.mockMint(contract.address, amount);
			expect(await contract.ethtxAvailable()).to.eq(amount);
		});
	});

	describe('ethtxOutstanding', function () {
		it('should reflect ETHtx supply not in contract', async function () {
			const { contract, tester } = fixture;
			const amount = parseETHtx('100');
			await contract.mockMint(contract.address, amount.mul(2));
			await contract.mockMint(tester, amount);
			expect(await contract.ethtxOutstanding()).to.eq(amount);
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
			const { contract, tester } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);
			const ethtxOutstanding = parseETHtx('100');
			await contract.mockMint(tester, ethtxOutstanding);

			expect(
				await contract.maxGasPrice(),
				'maxGasPrice is not gt gasPrice',
			).to.be.gt(defaultGasPrice);

			expect(await contract.gasPriceAtRedemption()).to.eq(defaultGasPrice);
		});

		it('should return maxGasPrice when gasPrice > maxGasPrice', async function () {
			const { contract, tester, oracle } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);
			const ethtxOutstanding = ethToEthtx(
				defaultGasPrice,
				targetETH(ethSupply),
			);
			await contract.mockMint(tester, ethtxOutstanding);

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
			const { contract, tester } = fixture;

			const ethSupply = parseEther('10');
			await addWETH(fixture, ethSupply);
			const ethtxOutstanding = ethToEthtx(
				defaultGasPrice,
				targetETH(ethSupply),
			);
			await contract.mockMint(tester, ethtxOutstanding);

			const expected = maxGasPrice(ethSupply, ethtxOutstanding);
			expect(await contract.maxGasPrice()).to.eq(expected);
		});
	});

	describe('burn', function () {
		it('can only be called by minter', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.burn(deployer, 1)).to.be.revertedWith(
				'caller is not the minter',
			);
		});

		it('should revert when paused', async function () {
			const { contract, deployer } = fixture;
			await contract.setMinter(deployer);
			await contract.pause();
			await expect(contract.burn(deployer, 1)).to.be.revertedWith('paused');
		});

		it('should burn tokens', async function () {
			const { contract, deployer, tester } = fixture;
			const amount = parseETHtx('100');
			await contract.setMinter(deployer);
			await contract.mint(tester, amount);

			await expect(contract.burn(tester, amount))
				.to.emit(contract, 'Transfer')
				.withArgs(tester, zeroAddress, amount);
		});
	});

	describe('buy', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 30;
			await expect(
				contract.buy(deadline, { value: parseEther('1') }),
			).to.be.revertedWith('expired');
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(
				contract.buy(deadline, { value: parseEther('1') }),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amount = parseEther('1');
			await expect(
				contract.buy(deadline, { value: amount }),
			).to.be.revertedWith('not enough ETHtx to buy');
		});

		it('should swap ETH -> WETH -> ETHtx', async function () {
			const { contract, deployer, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH);

			await contract.mockMint(contract.address, amountETHtx);
			await expect(contract.buy(deadline, { value: amountETH }))
				.to.emit(contract, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtx);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await contract.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(0);

			expect(
				await contract.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtx);
		});
	});

	describe('buyWithWETH', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 30;
			await expect(
				contract.buyWithWETH(parseEther('1'), deadline),
			).to.be.revertedWith('expired');
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(
				contract.buyWithWETH(parseEther('1'), deadline),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const amount = parseEther('1');
			await weth.deposit({ value: amount });
			await weth.approve(contract.address, amount);

			await expect(contract.buyWithWETH(amount, deadline)).to.be.revertedWith(
				'not enough ETHtx to buy',
			);
		});

		it('should swap WETH -> ETHtx', async function () {
			const { contract, deployer, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH);

			await weth.deposit({ value: amountETH });
			await weth.approve(contract.address, amountETH);

			await contract.mockMint(contract.address, amountETHtx);

			await expect(contract.buyWithWETH(amountETH, deadline))
				.to.emit(contract, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtx);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await contract.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(0);

			expect(
				await contract.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtx);
		});
	});

	describe('buyExact', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 30;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.buyExact(amountETHtx, deadline, { value: amountETH }),
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
				contract.buyExact(amountETHtx, deadline, { value: amountETH }),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.buyExact(amountETHtx, deadline, { value: amountETH }),
			).to.be.revertedWith('not enough ETHtx to buy');
		});

		it('should revert if ETH needed exceeds ETH value', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx.sub(1));
			await expect(
				contract.buyExact(amountETHtx, deadline, { value: amountETH }),
			).to.be.revertedWith('amountIn exceeds max');
		});

		it('should swap ETH -> WETH -> ETHtx', async function () {
			const { contract, deployer, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx);

			await contract.mockMint(contract.address, amountETHtx.add(1));
			await expect(
				contract.buyExact(amountETHtx, deadline, { value: amountETH }),
			)
				.to.emit(contract, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtx);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await contract.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(1);

			expect(
				await contract.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtx);
		});

		it('should refund leftover ETH', async function () {
			const { contract, deployerSigner } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('10');

			const ethSpent = ethtxToEth(defaultGasPrice, amountETHtx);
			expect(ethSpent, 'ETH required >= ETH sent').to.be.lt(amountETH);

			const initBalance = await deployerSigner.getBalance();

			let tx = await contract.mockMint(contract.address, amountETHtx);
			let ethUsed = await ethUsedOnGas(tx);

			tx = await contract.buyExact(amountETHtx, deadline, {
				value: amountETH,
			});
			ethUsed = ethUsed.add(await ethUsedOnGas(tx));

			const ethLost = ethSpent.add(ethUsed);
			expect(await deployerSigner.getBalance()).to.eq(
				initBalance.sub(ethLost),
			);
		});
	});

	describe('buyExactWithWETH', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 30;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.buyExactWithWETH(amountETH, amountETHtx, deadline),
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
				contract.buyExactWithWETH(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.buyExactWithWETH(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('not enough ETHtx to buy');
		});

		it('should revert if WETH needed exceeds amountInMax', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx.sub(1));
			await expect(
				contract.buyExactWithWETH(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('amountIn exceeds max');
		});

		it('should swap WETH -> ETHtx', async function () {
			const { contract, deployer, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const amountETH = ethtxToEth(defaultGasPrice, amountETHtx);

			await contract.mockMint(contract.address, amountETHtx.add(1));

			await weth.deposit({ value: amountETH });
			await weth.approve(contract.address, amountETH);

			await expect(contract.buyExactWithWETH(amountETH, amountETHtx, deadline))
				.to.emit(contract, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtx);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await contract.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(1);

			expect(
				await contract.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtx);
		});
	});

	describe('buyWithExactETH', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 30;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.buyWithExactETH(amountETHtx, deadline, { value: amountETH }),
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
				contract.buyWithExactETH(amountETHtx, deadline, { value: amountETH }),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.buyWithExactETH(amountETHtx, deadline, { value: amountETH }),
			).to.be.revertedWith('not enough ETHtx to buy');
		});

		it('should revert if ETHtx amountOut < amountOutMin', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH).add(1);
			await expect(
				contract.buyWithExactETH(amountETHtx, deadline, {
					value: amountETH,
				}),
			).to.be.revertedWith('amountOut below min');
		});

		it('should swap ETH -> WETH -> ETHtx', async function () {
			const { contract, deployer, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH);

			await contract.mockMint(contract.address, amountETHtx.add(1));
			await expect(
				contract.buyWithExactETH(amountETHtx, deadline, { value: amountETH }),
			)
				.to.emit(contract, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtx);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await contract.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(1);

			expect(
				await contract.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtx);
		});
	});

	describe('buyWithExactWETH', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 30;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.buyWithExactWETH(amountETH, amountETHtx, deadline),
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
				contract.buyWithExactWETH(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert without enough ethtxAvailable', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = parseETHtx('1');
			await expect(
				contract.buyWithExactWETH(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('not enough ETHtx to buy');
		});

		it('should revert if ETHtx amountOut < amountOutMin', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH).add(1);
			await expect(
				contract.buyWithExactWETH(amountETH, amountETHtx, deadline),
			).to.be.revertedWith('amountOut below min');
		});

		it('should swap WETH -> ETHtx', async function () {
			const { contract, deployer, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETH = parseEther('1');
			const amountETHtx = ethToEthtx(defaultGasPrice, amountETH);

			await contract.mockMint(contract.address, amountETHtx.add(1));

			await weth.deposit({ value: amountETH });
			await weth.approve(contract.address, amountETH);

			await expect(contract.buyWithExactWETH(amountETH, amountETHtx, deadline))
				.to.emit(contract, 'Transfer')
				.withArgs(contract.address, deployer, amountETHtx);

			expect(
				await weth.balanceOf(contract.address),
				'contract WETH balance mismatch',
			).to.eq(amountETH);

			expect(
				await contract.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(1);

			expect(
				await contract.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(amountETHtx);
		});
	});

	describe('mint', function () {
		it('can only be called by minter', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.mint(deployer, 1)).to.be.revertedWith(
				'caller is not the minter',
			);
		});

		it('should revert when paused', async function () {
			const { contract, deployer } = fixture;
			await contract.setMinter(deployer);
			await contract.pause();
			await expect(contract.mint(deployer, 1)).to.be.revertedWith('paused');
		});

		it('should mint tokens', async function () {
			const { contract, deployer, tester } = fixture;
			const amount = parseETHtx('100');
			await contract.setMinter(deployer);

			await expect(contract.mint(tester, amount))
				.to.emit(contract, 'Transfer')
				.withArgs(zeroAddress, tester, amount);
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

	describe('redeem', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 30;
			const amountETHtx = parseETHtx('100');
			await expect(contract.redeem(amountETHtx, deadline)).to.be.revertedWith(
				'expired',
			);
		});

		it('should revert with expired gas price', async function () {
			const { contract, oracle } = fixture;
			const now = Math.floor(Date.now() / 1000);
			const deadline = now + 3600;

			const amountETHtx = parseETHtx('100');

			await oracle.setUpdatedAt(now - oracleUpdateInterval * 2);

			await expect(contract.redeem(amountETHtx, deadline)).to.be.revertedWith(
				'gas price is outdated',
			);
		});

		it('should transfer correct ETHtx amount to contract', async function () {
			const { contract, deployer } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const contractETHtx = amountETHtx.sub(fee);
			const amountETH = ethtxToEth(defaultGasPrice, contractETHtx);

			await contract.mockMint(deployer, amountETHtx.add(1));
			await addWETH(fixture, amountETH);

			await expect(contract.redeem(amountETHtx, deadline))
				.to.emit(contract, 'Transfer')
				.withArgs(deployer, contract.address, contractETHtx);

			expect(
				await contract.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(contractETHtx);

			expect(
				await contract.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(1);
		});

		it('should transfer correct ETHtx amount to fee recipient', async function () {
			const { contract, deployer } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);
			const contractETHtx = amountETHtx.sub(fee);
			const amountETH = ethtxToEth(defaultGasPrice, contractETHtx);

			await contract.mockMint(deployer, amountETHtx);
			await addWETH(fixture, amountETH);

			await expect(contract.redeem(amountETHtx, deadline))
				.to.emit(contract, 'Transfer')
				.withArgs(deployer, feeRecipient, fee);

			expect(
				await contract.balanceOf(feeRecipient),
				'fee recipient ETHtx balance mismatch',
			).to.eq(fee);
		});

		it('should transfer correct WETH', async function () {
			const { contract, deployer, weth } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;

			const amountETHtx = parseETHtx('100');
			const fee = calcFee(amountETHtx);

			const ethRequired = targetETH(ethtxToEth(defaultGasPrice, amountETHtx));
			const ethReturned = ethtxToEth(defaultGasPrice, amountETHtx.sub(fee));

			await contract.mockMint(deployer, amountETHtx);
			await addWETH(fixture, ethRequired);

			await expect(contract.redeem(amountETHtx, deadline))
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

		it('should transfer correct WETH when maxGasPrice < gasPrice', async function () {
			const { contract, deployer, weth } = fixture;
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

			await contract.mockMint(deployer, amountETHtx);
			await addWETH(fixture, ethRequired);

			expect(await contract.maxGasPrice(), 'maxGasPrice mismatch').to.eq(
				defaultGasPrice.div(2),
			);

			await expect(contract.redeem(amountETHtx, deadline))
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
	});

	describe('redeemExact', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 30;
			const amountETHtx = parseETHtx('100');
			const amountETH = parseEther('1');
			await expect(
				contract.redeemExact(amountETHtx, amountETH, deadline),
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
				contract.redeemExact(amountETHtx, amountETH, deadline),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert when ETHtx amountIn > amountInMax', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const amountETHtx = parseETHtx('100');
			const amountETH = parseEther('1');
			await expect(
				contract.redeemExact(amountETHtx, amountETH, deadline),
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
				const { contract, deployer } = fixture;
				deadline = Math.floor(Date.now() / 1000) + 3600;

				await contract.mockMint(deployer, ethtxIn.add(ethtxLeft));
				await addWETH(fixture, ethSupply);
			});

			it('correct ETHtx amount to contract', async function () {
				const { contract, deployer } = fixture;

				await expect(contract.redeemExact(ethtxIn, ethOut, deadline))
					.to.emit(contract, 'Transfer')
					.withArgs(deployer, contract.address, contractETHtx);

				expect(
					await contract.balanceOf(contract.address),
					'contract ETHtx balance mismatch',
				).to.eq(contractETHtx);

				expect(
					await contract.balanceOf(deployer),
					'deployer ETHtx balance mismatch',
				).to.eq(ethtxLeft);
			});

			it('correct ETHtx amount to fee recipient', async function () {
				const { contract, deployer } = fixture;

				await expect(contract.redeemExact(ethtxIn, ethOut, deadline))
					.to.emit(contract, 'Transfer')
					.withArgs(deployer, feeRecipient, fee);

				expect(
					await contract.balanceOf(feeRecipient),
					'fee recipient ETHtx balance mismatch',
				).to.eq(fee);
			});

			it('correct WETH amount', async function () {
				const { contract, deployer, weth } = fixture;

				await expect(contract.redeemExact(ethtxIn, ethOut, deadline))
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
		});

		it('should transfer correct ETHtx when maxGasPrice < gasPrice', async function () {
			const { contract, deployer } = fixture;
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

			await contract.mockMint(deployer, ethtxOutstanding);
			await addWETH(fixture, ethSupply);

			await expect(contract.redeemExact(ethtxIn, ethOut, deadline))
				.to.emit(contract, 'Transfer')
				.withArgs(deployer, contract.address, contractETHtx);

			expect(
				await contract.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(contractETHtx);

			expect(
				await contract.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(ethtxLeft);
		});
	});

	describe('redeemWithExact', function () {
		it('should revert after deadline', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) - 30;
			const amountETHtx = parseETHtx('100');
			const amountETH = parseEther('1');
			await expect(
				contract.redeemWithExact(amountETHtx, amountETH, deadline),
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
				contract.redeemWithExact(amountETHtx, amountETH, deadline),
			).to.be.revertedWith('gas price is outdated');
		});

		it('should revert when ETH amountOut < amountOutMin', async function () {
			const { contract } = fixture;
			const deadline = Math.floor(Date.now() / 1000) + 3600;
			const ethtxIn = parseETHtx('1');
			const ethOut = parseEther('1');
			await expect(
				contract.redeemWithExact(ethtxIn, ethOut, deadline),
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
				const { contract, deployer } = fixture;
				deadline = Math.floor(Date.now() / 1000) + 3600;

				await contract.mockMint(deployer, ethtxIn.add(ethtxLeft));
				await addWETH(fixture, ethSupply);
			});

			it('correct ETHtx amount to contract', async function () {
				const { contract, deployer } = fixture;

				await expect(contract.redeemWithExact(ethtxIn, ethOut, deadline))
					.to.emit(contract, 'Transfer')
					.withArgs(deployer, contract.address, contractETHtx);

				expect(
					await contract.balanceOf(contract.address),
					'contract ETHtx balance mismatch',
				).to.eq(contractETHtx);

				expect(
					await contract.balanceOf(deployer),
					'deployer ETHtx balance mismatch',
				).to.eq(ethtxLeft);
			});

			it('correct ETHtx amount to fee recipient', async function () {
				const { contract, deployer } = fixture;

				await expect(contract.redeemWithExact(ethtxIn, ethOut, deadline))
					.to.emit(contract, 'Transfer')
					.withArgs(deployer, feeRecipient, fee);

				expect(
					await contract.balanceOf(feeRecipient),
					'fee recipient ETHtx balance mismatch',
				).to.eq(fee);
			});

			it('correct WETH', async function () {
				const { contract, deployer, weth } = fixture;

				await expect(contract.redeemWithExact(ethtxIn, ethOut, deadline))
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
		});

		it('should transfer correct WETH when maxGasPrice < gasPrice', async function () {
			const { contract, deployer } = fixture;
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

			await contract.mockMint(deployer, ethtxOutstanding);
			await addWETH(fixture, ethSupply);

			await expect(contract.redeemWithExact(ethtxIn, ethOut, deadline))
				.to.emit(contract, 'Transfer')
				.withArgs(deployer, contract.address, contractETHtx);

			expect(
				await contract.balanceOf(contract.address),
				'contract ETHtx balance mismatch',
			).to.eq(contractETHtx);

			expect(
				await contract.balanceOf(deployer),
				'deployer ETHtx balance mismatch',
			).to.eq(ethtxLeft);
		});
	});

	describe('setFeeLogic', function () {
		const newFeeLogic = zeroPadAddress('0x3');

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setFeeLogic(newFeeLogic)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should revert when set to zero address', async function () {
			const { contract } = fixture;
			await expect(contract.setFeeLogic(zeroAddress)).to.be.revertedWith(
				'feeLogic zero address',
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

	describe('setMinter', function () {
		const newMinter = zeroAddress;

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setMinter(newMinter)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should set gasOracle address', async function () {
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
