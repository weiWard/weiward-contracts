import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';

import {
	sushiswapPairFixture,
	uniswapPairFixture,
	uniswapPairFixtureFn,
} from '../helpers/fixtures';
import { zeroAddress } from '../helpers/address';
import { sqrt } from '../helpers/math';
import {
	MockERC20,
	MockERC20__factory,
	ValuePerUNIV2,
	ValuePerUNIV2__factory,
} from '../../build/types/ethers-v5';

const contractName = 'ValuePerUNIV2';

const tokenADecimals = 18;
const tokenBDecimals = 18;
function parseTokenA(value: string): BigNumber {
	return parseUnits(value, tokenADecimals);
}
function parseTokenB(value: string): BigNumber {
	return parseUnits(value, tokenBDecimals);
}

const initTokenABalance = 0;
const initTokenBBalance = 0;

interface Fixture {
	deployer: string;
	tester: string;
	contract: ValuePerUNIV2;
	testerContract: ValuePerUNIV2;
	tokenA: MockERC20;
	tokenB: MockERC20;
	factory: Contract;
	pair: Contract;
}

function getFixtureLoader(
	pairFixture: uniswapPairFixtureFn,
): (options?: unknown) => Promise<Fixture> {
	return deployments.createFixture(async ({ getNamedAccounts, waffle }) => {
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		// Deploy mock ERC20's
		const tokenA = await new MockERC20__factory(deployerSigner).deploy(
			'TokenA',
			'AERC20',
			tokenADecimals,
			initTokenABalance,
		);
		const tokenB = await new MockERC20__factory(deployerSigner).deploy(
			'TokenB',
			'BERC20',
			tokenBDecimals,
			initTokenBBalance,
		);

		// Deploy factory and pair
		const { factory, pair } = await pairFixture(deployer, tokenA, tokenB);

		// Deploy contract
		const contract = await new ValuePerUNIV2__factory(deployerSigner).deploy(
			pair.address,
			tokenA.address,
		);

		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			tester,
			contract,
			testerContract,
			tokenA,
			tokenB,
			factory,
			pair,
		};
	});
}

function runCommonTests(f: () => Fixture): void {
	describe('constructor', function () {
		it('initial state is correct', async function () {
			const { contract, tokenA, pair } = f();

			// Log addresses
			// console.log(`deployer: ${f().deployer}`);
			// console.log(`tester: ${f().tester}`);
			// console.log(`contract: ${f().contract.address}`);
			// console.log(`factory: ${f().factory.address}`);
			// console.log(`pair: ${f().pair.address}`);

			// Check tokens
			expect(await contract.token(), 'pair token address mismatch').to.eq(
				pair.address,
			);
			expect(
				await contract.valueToken(),
				'value token address mismatch',
			).to.eq(tokenA.address);

			const { numerator, denominator } = await contract.valuePerToken();
			expect(numerator, 'valuePerToken numerator mismatch').to.eq(0);
			expect(denominator, 'valuePerToken denominator mismatch').to.eq(0);

			expect(await contract.feeOn(), 'feeOn value mismatch').to.eq(false);
		});

		describe('should revert when', async function () {
			it('pair does not include token', async function () {
				const { contract, pair, factory } = f();
				await expect(
					new ValuePerUNIV2__factory(contract.signer).deploy(
						pair.address,
						factory.address,
					),
				).to.be.revertedWith('pool lacks token');
			});

			it('pair address cannot handle functions', async function () {
				// This isn't exhaustive like erc165: It's just a sanity check.
				const { contract, tokenA, factory } = f();
				await expect(
					new ValuePerUNIV2__factory(contract.signer).deploy(
						factory.address,
						tokenA.address,
					),
				).to.be.revertedWith('Transaction reverted without a reason');
			});
		});
	});

	describe('feeOn', function () {
		it('should be false when factory.feeTo is zero address', async function () {
			const { contract, factory } = f();

			expect(await factory.feeTo(), 'factory.feeTo mismatch').to.eq(
				zeroAddress,
			);

			expect(await contract.feeOn(), 'feeOn mismatch').to.eq(false);
		});

		it('should be true when factory.feeTo is set', async function () {
			const { tester, contract, factory } = f();

			await factory.setFeeTo(tester);
			expect(await factory.feeTo(), 'failed to set factor.feeTo').to.eq(
				tester,
			);

			expect(await contract.feeOn(), 'feeOn mismatch').to.eq(true);
		});
	});

	describe('valuePerToken', function () {
		const amountA = parseTokenA('1000');
		const amountB = parseTokenB('100');

		async function addLiquidity(): Promise<void> {
			const { deployer, tokenA, tokenB, pair } = f();

			await tokenA.mint(deployer, amountA);
			await tokenB.mint(deployer, amountB);

			await tokenA.transfer(pair.address, amountA);
			await tokenB.transfer(pair.address, amountB);
			await pair.mint(deployer);
		}

		beforeEach(async function () {
			// Create liquidity
			await addLiquidity();
		});

		it('numerator should match correct pair.reserve', async function () {
			const { contract, tokenA, pair } = f();

			const token0 = await pair.token0();
			const { _reserve0, _reserve1 } = await pair.getReserves();

			const reserve = tokenA.address === token0 ? _reserve0 : _reserve1;

			const { numerator } = await contract.valuePerToken();
			expect(numerator).to.eq(reserve);
		});

		it('numerator should be correct', async function () {
			const { contract } = f();
			const { numerator } = await contract.valuePerToken();
			expect(numerator).to.eq(amountA);
		});

		it('denominator should match pair.totalSupply', async function () {
			const { contract, pair } = f();

			const totalSupply = await pair.totalSupply();

			const { denominator } = await contract.valuePerToken();
			expect(denominator).to.eq(totalSupply);
		});

		it('denominator should adjust with feeOn', async function () {
			const { deployer, tester, tokenA, contract, factory, pair } = f();

			await factory.setFeeTo(tester);
			expect(await contract.feeOn(), 'feeOn mismatch').to.eq(true);

			await addLiquidity();

			const swapAmount = parseTokenA('1');

			// Calc amount out
			const reserve0 = amountA.mul(2);
			const reserve1 = amountB.mul(2);
			const amountInWithFee = swapAmount.mul(997);
			let n = swapAmount.mul(997).mul(reserve1);
			let d = reserve0.mul(1000).add(amountInWithFee);
			const amountOut = n.div(d);

			// Swap
			await tokenA.mint(deployer, swapAmount);
			await tokenA.transfer(pair.address, swapAmount);
			await pair.swap(amountOut, 0, deployer, '0x');

			let totalSupply = await pair.totalSupply();
			const { _reserve0, _reserve1 } = await pair.getReserves();
			const kLast = await pair.kLast();

			expect(kLast, 'kLast is zero').to.not.eq(0);

			const rootK = sqrt(_reserve0.mul(_reserve1));
			const rootKLast = sqrt(kLast);

			expect(rootK, 'rootK is not greater than rootKLast').to.be.gt(rootKLast);

			n = totalSupply.mul(rootK.sub(rootKLast));
			d = rootK.mul(5).add(rootKLast);
			const feeLiquidity = n.div(d);
			totalSupply = totalSupply.add(feeLiquidity);

			const { denominator } = await contract.valuePerToken();
			expect(denominator).to.eq(totalSupply);
		});
	});
}

describe(contractName, function () {
	let fixture: Fixture;

	function getFixture(): Fixture {
		return fixture;
	}

	describe('Uniswap', function () {
		const loadFixture = getFixtureLoader(uniswapPairFixture);
		beforeEach(async function () {
			fixture = await loadFixture();
		});

		runCommonTests(getFixture);
	});

	describe('SushiSwap', function () {
		const loadFixture = getFixtureLoader(sushiswapPairFixture);
		beforeEach(async function () {
			fixture = await loadFixture();
		});

		runCommonTests(getFixture);
	});
});
