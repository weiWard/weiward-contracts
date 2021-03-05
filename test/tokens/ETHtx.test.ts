import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseEther } from 'ethers/lib/utils';
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
} from '../helpers/conversions';
import {
	ETHmx,
	ETHmx__factory,
	MockETHtx,
	MockETHtx__factory,
	FeeLogic__factory,
	WETH9__factory,
	SimpleGasPrice,
	SimpleGasPrice__factory,
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
	oracle: SimpleGasPrice;
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

		const oracle = await new SimpleGasPrice__factory(deployerSigner).deploy(
			defaultGasPrice,
		);

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

describe.only(contractName, function () {
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
		it('should revert after deadline');

		it('should receive ETH and wrap to WETH');

		it('should revert without enough ethtxAvailable');

		it('should transfer correct ETHtx amount');
	});

	describe('buyWithWETH', function () {
		it('should revert after deadline');

		it('should transfer WETH to contract');
	});

	describe('buyExact', function () {
		it('should revert after deadline');

		it('should revert if ETH needed exceeds ETH value');

		it('should receive ETH and wrap to WETH');

		it('should transfer correct ETHtx amount');

		it('should refund leftover ETH');
	});

	describe('buyExactWithWETH', function () {
		it('should revert after deadline');

		it('should revert if WETH needed exceeds amountInMax');

		it('should transfer WETH to contract');

		it('should transfer correct ETHtx amount');
	});

	describe('buyWithExactETH', function () {
		it('should revert after deadline');

		it('should revert if ETHtx amountOut < amountOutMin');

		it('should receive ETH and wrap to WETH');

		it('should transfer correct ETHtx amount');
	});

	describe('buyWithExactWETH', function () {
		it('should revert after deadline');

		it('should revert if ETHtx amountOut < amountOutMin');

		it('should transfer WETH to contract');

		it('should transfer correct ETHtx amount');
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
		it('should revert after deadline');

		it('should transfer correct ETHtx amount to contract');

		it('should transfer correct WETH when asWETH is true');

		it('should unwrap and transfer correct ETH when asWETH is false');
	});

	describe('redeemExact', function () {
		it('should revert after deadline');

		it('should revert when ETHtx amountIn > amountInMax');

		it('should transfer correct ETHtx amount to contract');

		it('should transfer correct WETH when asWETH is true');

		it('should unwrap and transfer correct ETH when asWETH is false');
	});

	describe('redeemWithExact', function () {
		it('should revert after deadline');

		it('should revert when ETH amountOut < amountOutMin');

		it('should transfer correct ETHtx amount to contract');

		it('should transfer correct WETH when asWETH is true');

		it('should unwrap and transfer correct ETH when asWETH is false');
	});

	describe('setFeeLogic', function () {
		it('can only be called by owner');

		it('should revert when set to zero address');

		it('should set feeLogic address');

		it('should emit FeeLogicSet event');
	});

	describe('setGasOracle', function () {
		it('can only be called by owner');

		it('should revert when set to zero address');

		it('should set gasOracle address');

		it('should emit GasOracleSet event');
	});

	describe('setMinter', function () {
		it('can only be called by owner');

		it('should set minter address');

		it('should emit MinterSet event');
	});

	describe('setTargetCRatio', function () {
		it('can only be called by owner');

		it('should revert if numerator is 0');

		it('should revert if denominator is 0');

		it('should set targetCRatio');

		it('should emit TargetCRatioSet event');
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
