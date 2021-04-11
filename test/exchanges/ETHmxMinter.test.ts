import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { JsonRpcSigner } from '@ethersproject/providers';
import { Zero } from '@ethersproject/constants';

import { zeroAddress, zeroPadAddress } from '../helpers/address';
import { parseGwei, parseETHtx } from '../helpers/conversions';
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
} from '../../build/types/ethers-v5';

const contractName = 'ETHmxMinter';

const mintGasPrice = parseGwei('1000');
const roiNumerator = 5;
const roiDenominator = 1;
const feeRecipient = zeroPadAddress('0x1');
const earlyThreshold = parseEther('1000');
const earlyMultiplier = 2;

function ethmxFromEthIntegral(amountETH: BigNumber): BigNumber {
	return amountETH
		.mul(earlyMultiplier)
		.sub(amountETH.mul(amountETH).div(earlyThreshold.mul(2)));
}

function ethmxFromEth(
	totalGiven: BigNumber,
	amountETH: BigNumber,
	roiNum: BigNumberish = roiNumerator,
	roiDen: BigNumberish = roiDenominator,
): BigNumber {
	if (totalGiven.lt(earlyThreshold)) {
		const start = ethmxFromEthIntegral(totalGiven);

		const currentLeft = earlyThreshold.sub(totalGiven);
		if (amountETH.lt(currentLeft)) {
			const end = ethmxFromEthIntegral(totalGiven.add(amountETH));
			amountETH = end.sub(start);
		} else {
			const end = ethmxFromEthIntegral(earlyThreshold);
			const added = end.sub(start).sub(currentLeft);
			amountETH = amountETH.add(added);
		}
	}

	return ethmxFromEthRaw(amountETH, roiNum, roiDen);
}

function ethmxFromEthRaw(
	amountETH: BigNumber,
	roiNum: BigNumberish = roiNumerator,
	roiDen: BigNumberish = roiDenominator,
): BigNumber {
	return amountETH.mul(roiNum).div(roiDen);
}

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: ETHmxMinter;
	testerContract: ETHmxMinter;
	ethmx: ETHmx;
	ethtx: MockETHtx;
	ethtxAMM: ETHtxAMM;
	feeLogic: FeeLogic;
	weth: WETH9;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ getNamedAccounts, waffle }) => {
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const feeLogic = await new FeeLogic__factory(deployerSigner).deploy(
			deployer,
			feeRecipient,
			75,
			1000,
		);

		const oracle = await new SimpleGasPrice__factory(deployerSigner).deploy(
			parseGwei('200'),
		);

		const weth = await new WETH9__factory(deployerSigner).deploy();

		const ethtx = await new MockETHtx__factory(deployerSigner).deploy(
			deployer,
			feeLogic.address,
			zeroAddress, // ethmx address
		);

		const ethtxAMM = await new ETHtxAMM__factory(deployerSigner).deploy(
			deployer,
			ethtx.address,
			oracle.address,
			weth.address,
			2,
			1,
		);
		await feeLogic.setExempt(ethtxAMM.address, true);

		const ethmx = await new ETHmx__factory(deployerSigner).deploy(
			deployer,
			zeroAddress,
		);

		const contract = await new ETHmxMinter__factory(deployerSigner).deploy(
			deployer,
		);
		await contract.postInit({
			ethmx: ethmx.address,
			ethtx: ethtx.address,
			ethtxAMM: ethtxAMM.address,
			weth: weth.address,
			mintGasPrice,
			roiNumerator,
			roiDenominator,
			earlyThreshold,
		});

		await ethtx.setMinter(contract.address);
		await ethmx.setMinter(contract.address);

		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			testerContract,
			ethmx,
			ethtx,
			ethtxAMM,
			feeLogic,
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
			const { deployer, contract, ethmx, ethtx, ethtxAMM, weth } = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);

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

			const [roiNum, roiDen] = await contract.roi();
			expect(roiNum, 'roi numerator mismatch').to.eq(roiNumerator);
			expect(roiDen, 'roi denominator mismatch').to.eq(roiDenominator);
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
			it('when totalGiven == 0', async function () {
				const { contract } = fixture;

				const amount = parseEther('10');
				const expected = ethmxFromEth(Zero, amount);
				expect(expected, 'test calculation mismatch').to.eq(
					parseEther('99.75'), // 10x amount - 2.5x amount/1000
				);

				expect(await contract.ethmxFromEth(amount)).to.eq(expected);
			});

			it('when totalGiven == earlyThreshold / 4', async function () {
				const { contract } = fixture;

				const ethGiven = earlyThreshold.div(4);
				await contract.mint({ value: ethGiven });

				const amount = parseEther('10');
				const expected = ethmxFromEth(ethGiven, amount);
				expect(expected, 'test calculation mismatch').to.eq(
					parseEther('87.25'), // 8.75x amount - 2.5x amount/1000
				);

				expect(await contract.ethmxFromEth(amount)).to.eq(expected);
			});

			it('when totalGiven == earlyThreshold / 2', async function () {
				const { contract } = fixture;

				const ethGiven = earlyThreshold.div(2);
				await contract.mint({ value: ethGiven });

				const amount = parseEther('10');
				const expected = ethmxFromEth(ethGiven, amount);
				expect(expected, 'test calculation mismatch').to.eq(
					parseEther('74.75'), // 7.5x amount - 2.5x amount/1000
				);

				expect(await contract.ethmxFromEth(amount)).to.eq(expected);
			});

			it('when totalGiven == earlyThreshold * 3 / 4', async function () {
				const { contract } = fixture;

				const ethGiven = earlyThreshold.mul(3).div(4);
				await contract.mint({ value: ethGiven });

				const amount = parseEther('10');
				const expected = ethmxFromEth(ethGiven, amount);
				expect(expected, 'test calculation mismatch').to.eq(
					parseEther('62.25'), // 6.25x amount - 2.5x amount/1000
				);

				expect(await contract.ethmxFromEth(amount)).to.eq(expected);
			});

			it('when totalGiven == earlyThreshold', async function () {
				const { contract } = fixture;

				const ethGiven = earlyThreshold;
				await contract.mint({ value: ethGiven });

				const amount = parseEther('10');
				const expected = ethmxFromEth(ethGiven, amount);
				expect(expected, 'test calculation mismatch').to.eq(
					parseEther('50'), // 5x amount
				);

				expect(await contract.ethmxFromEth(amount)).to.eq(expected);
			});

			it('when totalGiven > earlyThreshold', async function () {
				const { contract } = fixture;

				const ethGiven = earlyThreshold.add(1);
				await contract.mint({ value: ethGiven });

				const amount = parseEther('10');
				const expected = ethmxFromEth(ethGiven, amount);
				expect(expected, 'test calculation mismatch').to.eq(
					parseEther('50'), // 5x amount
				);

				expect(await contract.ethmxFromEth(amount)).to.eq(expected);
			});

			it('when amountEthIn > earlyThreshold - totalGiven', async function () {
				const { contract } = fixture;

				const amount = parseEther('10');
				const ethGiven = earlyThreshold.sub(amount.div(2));
				await contract.mint({ value: ethGiven });

				const expected = ethmxFromEth(ethGiven, amount);
				expect(expected, 'test calculation mismatch').to.eq(
					parseEther('50.0625'),
				);

				expect(await contract.ethmxFromEth(amount)).to.eq(expected);
			});
		});

		it('should change with roi', async function () {
			const { contract } = fixture;

			const roiNum = 7;
			const roiDen = 5;
			expect(roiNum, 'roi numerator will not change').to.not.eq(roiNumerator);
			expect(roiDen, 'roi denominator will not change').to.not.eq(
				roiDenominator,
			);

			const amount = parseEther('10');
			const expected = ethmxFromEth(Zero, amount, roiNum, roiDen);

			await contract.setRoi(roiNum, roiDen);

			expect(await contract.ethmxFromEth(amount)).to.eq(expected);
		});
	});

	describe('ethmxFromEthtx', function () {
		it('should be  correct', async function () {
			const { contract, ethtxAMM } = fixture;

			const amountEthtx = parseETHtx('10000');
			const amountEth = await ethtxAMM.ethForEthtx(amountEthtx);

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
				const expected = ethmxFromEth(Zero, amount);
				expect(await ethmx.balanceOf(deployer)).to.eq(expected);
			});

			it('and increase totalGiven', async function () {
				const { contract } = fixture;
				expect(await contract.totalGiven()).to.eq(amount);
			});
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
			const amountETH = (await ethtxAMM.ethForEthtx(amount))
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
			const amountETH = (await ethtxAMM.ethForEthtx(amount))
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
			const amountETH = (await ethtxAMM.ethForEthtx(amount))
				.mul(targetNum)
				.div(targetDen)
				.sub(1);

			await deployerSigner.sendTransaction({
				to: ethtxAMM.address,
				value: amountETH,
			});

			// const needed = await ethtxAMM.ethNeeded();
			// console.log(`needed: ${needed.toString()}`);
			// const neededInEthtx = await ethtxAMM.ethtxFromEth(needed);
			// console.log(`neededInEthtx: ${neededInEthtx.toString()}`);
			// const neededBackInETh = await ethtxAMM.ethForEthtx(neededInEthtx);
			// console.log(`neededBackInETh: ${neededBackInETh.toString()}`);

			await expect(contract.mintWithETHtx(239 + 238)).to.be.revertedWith(
				'ETHtx value burnt exceeds ETH needed',
			);
		});

		it('should revert when collateral is not needed', async function () {
			const { contract, deployerSigner, ethtxAMM } = fixture;

			const [targetNum, targetDen] = await ethtxAMM.targetCRatio();
			const amountETH = (await ethtxAMM.ethForEthtx(amount))
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
				const expected = ethmxFromEth(Zero, amount);
				expect(await ethmx.balanceOf(deployer)).to.eq(expected);
			});

			it('and increase totalGiven', async function () {
				const { contract } = fixture;
				expect(await contract.totalGiven()).to.eq(amount);
			});
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

	describe('setEarlyThreshold', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			const value = 1;
			await expect(testerContract.setEarlyThreshold(value)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should set earlyThreshold', async function () {
			const { contract } = fixture;
			const value = 1;
			await contract.setEarlyThreshold(value);
			expect(await contract.earlyThreshold()).to.eq(value);
		});

		it('should emit EarlyThresholdSet event', async function () {
			const { contract, deployer } = fixture;
			const value = 1;
			await expect(contract.setEarlyThreshold(value))
				.to.emit(contract, 'EarlyThresholdSet')
				.withArgs(deployer, value);
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

	describe('setRoi', function () {
		const roiNum = 7;
		const roiDen = 5;

		before(function () {
			expect(roiNum, 'roi numerator will not change').to.not.eq(roiNumerator);
			expect(roiDen, 'roi denominator will not change').to.not.eq(
				roiDenominator,
			);
		});

		it('should set roi', async function () {
			const { contract } = fixture;
			await contract.setRoi(roiNum, roiDen);

			const [num, den] = await contract.roi();
			expect(num, 'roi numerator mismatch').to.eq(roiNum);
			expect(den, 'roi denominator mismatch').to.eq(roiDen);
		});

		it('should emit RoiSet event', async function () {
			const { contract, deployer } = fixture;

			await expect(contract.setRoi(roiNum, roiDen))
				.to.emit(contract, 'RoiSet')
				.withArgs(deployer, roiNum, roiDen);
		});

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(testerContract.setRoi(roiNum, roiDen)).to.be.revertedWith(
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
