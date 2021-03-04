import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { BigNumber } from '@ethersproject/bignumber';
import { JsonRpcSigner } from '@ethersproject/providers';

import { zeroAddress, zeroPadAddress } from '../helpers/address';
import {
	ETHmx,
	ETHmx__factory,
	MockETHtx,
	MockETHtx__factory,
	FeeLogic__factory,
	WETH9__factory,
	SimpleGasPrice__factory,
	WETH9,
	FeeLogic,
} from '../../build/types/ethers-v5';

const contractName = 'ETHmx';

function parseETHmx(value: string): BigNumber {
	return parseUnits(value, 18);
}
function parseETHtx(value: string): BigNumber {
	return parseUnits(value, 18);
}
function parseGwei(value: string): BigNumber {
	return parseUnits(value, 9);
}

const mintGasPrice = parseGwei('1800');
const roiNumerator = 5;
const roiDenominator = 1;
const feeRecipient = zeroPadAddress('0x1');

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: ETHmx;
	testerContract: ETHmx;
	ethtx: MockETHtx;
	feeLogic: FeeLogic;
	weth: WETH9;
}

const loadFixture = deployments.createFixture(
	async ({ getNamedAccounts, waffle }) => {
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const feeLogic = await new FeeLogic__factory(deployerSigner).deploy(
			feeRecipient,
			75,
			1000,
		);

		const oracle = await new SimpleGasPrice__factory(deployerSigner).deploy(
			parseGwei('200'),
		);

		const weth = await new WETH9__factory(deployerSigner).deploy();

		const ethtx = await new MockETHtx__factory(deployerSigner).deploy(
			feeLogic.address,
			oracle.address,
			zeroAddress, // ethmx address
			weth.address,
			2,
			1,
		);

		const contract = await new ETHmx__factory(deployerSigner).deploy(
			ethtx.address,
			weth.address,
			mintGasPrice,
			roiNumerator,
			roiDenominator,
		);

		await ethtx.setMinter(contract.address);

		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			testerContract,
			ethtx,
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
			const { deployer, contract, ethtx, weth } = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);

			expect(await contract.ethtxAddr(), 'ETHtx address mismatch').to.eq(
				ethtx.address,
			);
			expect(await contract.wethAddr(), 'WETH address mismatch').to.eq(
				weth.address,
			);

			expect(await contract.mintGasPrice(), 'mintGasPrice mismatch').to.eq(
				mintGasPrice,
			);

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
		it('should be correct', async function () {
			const { contract } = fixture;

			const amount = parseEther('10');
			const expected = amount.mul(roiNumerator).div(roiDenominator);
			expect(await contract.ethmxFromEth(amount)).to.eq(expected);
		});

		it('should change with roi', async function () {
			const { contract } = fixture;

			const roiNum = 7;
			const roiDen = 5;
			expect(roiNum / roiDen).to.not.eq(roiNumerator / roiDenominator);

			const amount = parseEther('10');
			const expected = amount.mul(roiNum).div(roiDen);

			await contract.setRoi(roiNum, roiDen);

			expect(await contract.ethmxFromEth(amount)).to.eq(expected);
		});
	});

	describe('ethmxFromEthtx', function () {
		it('should be  correct', async function () {
			const { contract, ethtx } = fixture;

			const amountEthtx = parseETHtx('10000');
			const amountEth = await ethtx.ethForEthtx(amountEthtx);
			const expected = await contract.ethmxFromEth(amountEth);

			expect(await contract.ethmxFromEthtx(amountEthtx)).to.eq(expected);
		});
	});

	describe('ethtxFromEth', function () {
		it('should be correct', async function () {
			const { contract, ethtx } = fixture;

			const amount = parseEther('10');
			const num = amount.mul(parseUnits('1', 18));
			const den = mintGasPrice.mul(await ethtx.gasPerETHtx());
			const expected = num.div(den);

			expect(await contract.ethtxFromEth(amount)).to.eq(expected);
		});

		it('should change with mintGasPrice', async function () {
			const { contract, ethtx } = fixture;

			const newMintPrice = parseGwei('600');
			expect(newMintPrice).to.not.eq(mintGasPrice);

			await contract.setMintGasPrice(newMintPrice);

			const amount = parseEther('10');
			const num = amount.mul(parseUnits('1', 18));
			const den = newMintPrice.mul(await ethtx.gasPerETHtx());
			const expected = num.div(den);

			expect(await contract.ethtxFromEth(amount)).to.eq(expected);
		});
	});

	describe('burn', function () {
		it('should burn correct amount from sender', async function () {
			const { contract, deployer } = fixture;

			await contract.mint({ value: parseEther('10') });

			const balanceBefore = await contract.balanceOf(deployer);

			const burnt = parseETHmx('5');
			await contract.burn(burnt);

			const balanceAfter = await contract.balanceOf(deployer);
			expect(balanceAfter).to.eq(balanceBefore.sub(burnt));
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
				const { ethtx, weth } = fixture;
				expect(await weth.balanceOf(ethtx.address)).to.eq(amount);
			});

			it('correct ETHtx amount', async function () {
				const { contract, ethtx } = fixture;
				const expected = await contract.ethtxFromEth(amount);
				expect(await ethtx.ethtxAvailable()).to.eq(expected);
			});

			it('correct ETHmx amount', async function () {
				const { contract, deployer } = fixture;
				const expected = await contract.ethmxFromEth(amount);
				expect(await contract.balanceOf(deployer)).to.eq(expected);
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
			const { contract, deployer } = fixture;
			const amountETHmx = await contract.ethmxFromEthtx(amount);

			await expect(contract.mintWithETHtx(amount), 'event mismatch')
				.to.emit(contract, 'Transfer')
				.withArgs(zeroAddress, deployer, amountETHmx);

			expect(await contract.balanceOf(deployer), 'balance mismatch').to.eq(
				amountETHmx,
			);
			expect(await contract.totalSupply(), 'totalSupply mismatch').to.eq(
				amountETHmx,
			);
		});

		it('should revert with enough collateral', async function () {
			const { contract, deployerSigner, ethtx } = fixture;

			const [targetNum, targetDen] = await ethtx.targetCRatio();
			const amountETH = (await ethtx.ethForEthtx(amount))
				.mul(targetNum)
				.div(targetDen);

			await deployerSigner.sendTransaction({
				to: ethtx.address,
				value: amountETH,
			});

			await expect(contract.mintWithETHtx(amount)).to.be.revertedWith(
				'can only burn ETHtx if undercollateralized',
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
				const { ethtx, weth } = fixture;
				expect(await weth.balanceOf(ethtx.address)).to.eq(amount);
			});

			it('correct ETHtx amount', async function () {
				const { contract, ethtx } = fixture;
				const expected = await contract.ethtxFromEth(amount);
				expect(await ethtx.ethtxAvailable()).to.eq(expected);
			});

			it('correct ETHmx amount', async function () {
				const { contract, deployer } = fixture;
				const expected = await contract.ethmxFromEth(amount);
				expect(await contract.balanceOf(deployer)).to.eq(expected);
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

	describe('setEthtxAddress', function () {
		it('should set ETHtx address', async function () {
			const { contract } = fixture;
			const address = zeroPadAddress('0x1');
			await contract.setEthtxAddress(address);
			expect(await contract.ethtxAddr()).to.eq(address);
		});

		it('should emit EthtxAddressSet event', async function () {
			const { contract, deployer } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(contract.setEthtxAddress(address))
				.to.emit(contract, 'EthtxAddressSet')
				.withArgs(deployer, address);
		});

		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			const address = zeroPadAddress('0x1');
			await expect(testerContract.setEthtxAddress(address)).to.be.revertedWith(
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
			expect(roiNum / roiDen).to.not.eq(roiNumerator / roiDenominator);
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
