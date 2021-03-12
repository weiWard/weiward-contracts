import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';
import { BigNumber } from '@ethersproject/bignumber';

import { mooniswapFixture } from '../helpers/fixtures';
import { zeroAddress } from '../helpers/address';
import {
	MockERC20,
	MockERC20__factory,
	Mooniswap,
	MooniFactory,
	ValuePerMoonV1,
	ValuePerMoonV1__factory,
} from '../../build/types/ethers-v5';

const contractName = 'ValuePerMoonV1';

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
	contract: ValuePerMoonV1;
	testerContract: ValuePerMoonV1;
	tokenA: MockERC20;
	tokenB: MockERC20;
	factory: MooniFactory;
	pool: Mooniswap;
	token0: MockERC20;
	token1: MockERC20;
}

const loadFixture = deployments.createFixture(
	async ({ getNamedAccounts, waffle }) => {
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

		// Deploy factory and pool
		const { factory, pool, token0, token1 } = await mooniswapFixture(
			deployerSigner,
			tokenA,
			tokenB,
		);

		// Deploy contract
		const contract = await new ValuePerMoonV1__factory(deployerSigner).deploy(
			pool.address,
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
			pool,
			token0: token0 as MockERC20,
			token1: token1 as MockERC20,
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
			const { contract, tokenA, pool } = fixture;

			// Log addresses
			// console.log(`deployer: ${f.deployer}`);
			// console.log(`tester: ${f.tester}`);
			// console.log(`contract: ${f.contract.address}`);
			// console.log(`factory: ${f.factory.address}`);
			// console.log(`pool: ${f.pool.address}`);

			// Check tokens
			expect(await contract.token(), 'pool token address mismatch').to.eq(
				pool.address,
			);
			expect(
				await contract.valueToken(),
				'value token address mismatch',
			).to.eq(tokenA.address);

			const { numerator, denominator } = await contract.valuePerToken();
			expect(numerator, 'valuePerToken numerator mismatch').to.eq(0);
			expect(denominator, 'valuePerToken denominator mismatch').to.eq(0);
		});

		describe('should revert when', async function () {
			it('pool does not include token', async function () {
				const { contract, pool, factory } = fixture;
				await expect(
					new ValuePerMoonV1__factory(contract.signer).deploy(
						pool.address,
						factory.address,
					),
				).to.be.revertedWith('pool lacks token');
			});

			it('pool address cannot handle functions', async function () {
				// This isn't exhaustive like erc165: It's just a sanity check.
				const { contract, tokenA, factory } = fixture;
				await expect(
					new ValuePerMoonV1__factory(contract.signer).deploy(
						factory.address,
						tokenA.address,
					),
				).to.be.revertedWith(
					"function selector was not recognized and there's no fallback function",
				);
			});
		});
	});

	describe('valuePerToken', function () {
		const amountA = parseTokenA('1000');
		const amountB = parseTokenB('100');

		async function addLiquidity(fixture: Fixture): Promise<void> {
			const { deployer, tokenA, tokenB, pool, token0 } = fixture;

			await tokenA.mint(deployer, amountA);
			await tokenB.mint(deployer, amountB);

			await tokenA.increaseAllowance(pool.address, amountA);
			await tokenB.increaseAllowance(pool.address, amountB);

			let amount0;
			let amount1;
			if (tokenA.address === token0.address) {
				amount0 = amountA;
				amount1 = amountB;
			} else {
				amount0 = amountB;
				amount1 = amountA;
			}

			await pool.deposit([amount0, amount1], [0, 0]);
		}

		beforeEach(async function () {
			// Create liquidity
			await addLiquidity(fixture);
		});

		it('numerator should match correct pool balance', async function () {
			const { contract, tokenA, pool } = fixture;

			const expected = await tokenA.balanceOf(pool.address);

			const { numerator } = await contract.valuePerToken();
			expect(numerator).to.eq(expected);
		});

		it('numerator should be correct', async function () {
			const { contract } = fixture;
			const { numerator } = await contract.valuePerToken();
			expect(numerator).to.eq(amountA);
		});

		it('denominator should match pool.totalSupply', async function () {
			const { contract, pool } = fixture;

			const totalSupply = await pool.totalSupply();

			const { denominator } = await contract.valuePerToken();
			expect(denominator).to.eq(totalSupply);
		});

		describe('with fee', function () {
			const swapAmount = parseTokenA('1');
			beforeEach(async function () {
				const { deployer, tokenA, tokenB, factory, pool } = fixture;

				await factory.setFee(parseUnits('3', 15));

				await addLiquidity(fixture);

				await tokenA.mint(deployer, swapAmount);
				await tokenA.increaseAllowance(pool.address, swapAmount);
				pool.swap(tokenA.address, tokenB.address, swapAmount, 0, zeroAddress);

				await addLiquidity(fixture);
			});

			it('numerator should be correct', async function () {
				const { contract, tokenA, pool } = fixture;

				const expected = amountA.mul(3).add(swapAmount);

				expect(
					await tokenA.balanceOf(pool.address),
					'tokenA.balanceOf(pool) mismatch',
				).to.eq(expected);

				const { numerator } = await contract.valuePerToken();
				expect(numerator).to.eq(expected);
			});

			it('denominator should be correct', async function () {
				const { contract, pool } = fixture;
				const totalSupply = await pool.totalSupply();
				const { denominator } = await contract.valuePerToken();
				expect(denominator).to.eq(totalSupply);
			});
		});
	});
});
