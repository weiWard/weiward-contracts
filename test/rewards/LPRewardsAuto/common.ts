import { deployments } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';

import {
	MockERC20,
	MockLPRewardsAuto,
	Mooniswap,
	MockERC20__factory,
	MockLPRewardsAuto__factory,
	ValuePerUNIV2,
	ValuePerUNIV2__factory,
	ValuePerMoonV1,
	ValuePerMoonV1__factory,
} from '../../../build/types/ethers-v5';
import {
	mooniswapFixture,
	sushiswapPairFixture,
	uniswapPairFixture,
} from '../../helpers/fixtures';
import { sqrt } from '../../helpers/math';
import { mineBlock as mineBlockWithProvider } from '../../helpers/timeTravel';

export const tokenADecimals = 18;
export function parseTokenA(value: string): BigNumber {
	return parseUnits(value, tokenADecimals);
}
export const tokenBDecimals = 18;
export function parseTokenB(value: string): BigNumber {
	return parseUnits(value, tokenBDecimals);
}
export const rewardsDecimals = tokenBDecimals;
export function parseRewardsToken(value: string): BigNumber {
	return parseUnits(value, rewardsDecimals);
}
export const lpDecimals = 18;
export function parseLPToken(value: string): BigNumber {
	return parseUnits(value, lpDecimals);
}

export const roundingExponent = 36;
export const roundingMultiplier = BigNumber.from(10).pow(roundingExponent);

export const defaultAmountA = parseTokenA('10000');
export const defaultAmountB = parseTokenB('50');
export const defaultRewards = parseRewardsToken('5');

export const defaultAmounts = {
	a: defaultAmountA,
	b: defaultAmountB,
	rewards: defaultRewards,
};

export const mooniswapBaseSupply = BigNumber.from(1000);
export const uniswapMinLiquidity = BigNumber.from(1000);

export interface Fixture {
	deployer: string;
	tester: string;
	contract: MockLPRewardsAuto;
	testerContract: MockLPRewardsAuto;
	tokenA: MockERC20;
	tokenB: MockERC20;
	rewardsToken: MockERC20;
	mooniswapPool: Mooniswap;
	testerMooniswapPool: Mooniswap;
	valuePerMoonV1: ValuePerMoonV1;
	sushiswapPool: Contract;
	testerSushiswapPool: Contract;
	valuePerSushi: ValuePerUNIV2;
	uniswapPool: Contract;
	testerUniswapPool: Contract;
	valuePerUNIV2: ValuePerUNIV2;
	testPool: Contract;
	valuePerTest: ValuePerUNIV2;
}

export const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ getNamedAccounts, waffle }) => {
		// Get accounts
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		// Deploy mock ERC20s
		const erc20Factory = new MockERC20__factory(deployerSigner);
		const tokenA = await erc20Factory.deploy(
			'Token A',
			'AERC20',
			tokenADecimals,
			0,
		);
		const tokenB = await erc20Factory.deploy(
			'Token B',
			'BERC20',
			tokenBDecimals,
			0,
		);
		const rewardsToken = tokenB;

		// Deploy LPs and valuePerToken implementations
		const { pool: mooniswapPool } = await mooniswapFixture(
			deployerSigner,
			tokenA,
			tokenB,
		);
		const testerMooniswapPool = mooniswapPool.connect(testerSigner);
		const valuePerMoonV1 = await new ValuePerMoonV1__factory(
			deployerSigner,
		).deploy(mooniswapPool.address, tokenA.address);

		const { pair: sushiswapPool } = await sushiswapPairFixture(
			deployer,
			tokenA,
			tokenB,
		);
		const testerSushiswapPool = sushiswapPool.connect(testerSigner);
		const valuePerSushi = await new ValuePerUNIV2__factory(
			deployerSigner,
		).deploy(sushiswapPool.address, tokenA.address);

		const { pair: uniswapPool } = await uniswapPairFixture(
			deployer,
			tokenA,
			tokenB,
		);
		const testerUniswapPool = uniswapPool.connect(testerSigner);
		const valuePerUNIV2 = await new ValuePerUNIV2__factory(
			deployerSigner,
		).deploy(uniswapPool.address, tokenA.address);

		const { pair: testPool } = await uniswapPairFixture(
			deployer,
			tokenA,
			tokenB,
		);
		const valuePerTest = await new ValuePerUNIV2__factory(
			deployerSigner,
		).deploy(testPool.address, tokenA.address);

		// Deploy contract
		const contract = await new MockLPRewardsAuto__factory(
			deployerSigner,
		).deploy(rewardsToken.address);
		const testerContract = contract.connect(testerSigner);

		// Add support for tokens
		await contract.addToken(mooniswapPool.address, valuePerMoonV1.address);
		await contract.addToken(sushiswapPool.address, valuePerSushi.address);
		await contract.addToken(uniswapPool.address, valuePerUNIV2.address);

		return {
			deployer,
			tester,
			contract,
			testerContract,
			tokenA,
			tokenB,
			rewardsToken,
			mooniswapPool,
			testerMooniswapPool,
			valuePerMoonV1,
			sushiswapPool,
			testerSushiswapPool,
			valuePerSushi,
			uniswapPool,
			testerUniswapPool,
			valuePerUNIV2,
			testPool,
			valuePerTest,
		};
	},
);

async function stakeImpl(
	fixture: Fixture,
	pool: Contract,
	addLiquidity: (
		fixture: Fixture,
		from?: string,
		amountA?: BigNumberish,
		amountB?: BigNumberish,
	) => Promise<BigNumber>,
	from?: string,
	amountA: BigNumberish = defaultAmountA,
	amountB: BigNumberish = defaultAmountB,
): Promise<BigNumber> {
	const { deployer, tester, contract, testerContract } = fixture;

	let contractHandle: MockLPRewardsAuto;
	let poolHandle: Contract;

	switch (from) {
		case tester:
			contractHandle = testerContract;
			poolHandle = pool.connect(testerContract.signer);
			break;
		case undefined:
		case deployer:
			contractHandle = contract;
			poolHandle = pool;
			break;
		default:
			throw Error('stakeImpl: unsupported from parameter');
	}

	const amount = await addLiquidity(fixture, from, amountA, amountB);
	await poolHandle.approve(contract.address, amount);
	await contractHandle.stake(pool.address, amount);

	return amount;
}

async function uniAddLiquidityImpl(
	fixture: Fixture,
	pool: Contract,
	from?: string,
	amountA: BigNumberish = defaultAmountA,
	amountB: BigNumberish = defaultAmountB,
): Promise<BigNumber> {
	const { deployer, tokenA, tokenB } = fixture;
	if (!from) {
		from = deployer;
	}

	const initBalance: BigNumber = await pool.balanceOf(from);

	await tokenA.mint(pool.address, amountA);
	await tokenB.mint(pool.address, amountB);
	await pool.mint(from);

	const newBalance: BigNumber = await pool.balanceOf(from);

	return newBalance.sub(initBalance);
}

export async function uniAddLiquidity(
	fixture: Fixture,
	from?: string,
	amountA: BigNumberish = defaultAmountA,
	amountB: BigNumberish = defaultAmountB,
): Promise<BigNumber> {
	const { uniswapPool } = fixture;
	return uniAddLiquidityImpl(fixture, uniswapPool, from, amountA, amountB);
}

export async function uniLiquidityMintedImpl(
	fixture: Fixture,
	pool: Contract,
	totalSupply: BigNumber = BigNumber.from(0),
	amountA: BigNumber = defaultAmountA,
	amountB: BigNumber = defaultAmountB,
): Promise<BigNumber> {
	if (totalSupply.eq(0)) {
		return sqrt(amountA.mul(amountB)).sub(uniswapMinLiquidity);
	}

	const { tokenA } = fixture;

	const token0 = await pool.token0();
	const { _reserve0, _reserve1 } = await pool.getReserves();

	let amount0;
	let amount1;
	if (token0 === tokenA.address) {
		amount0 = amountA;
		amount1 = amountB;
	} else {
		amount0 = amountB;
		amount1 = amountA;
	}

	amount0 = amount0.mul(totalSupply).div(_reserve0);
	amount1 = amount1.mul(totalSupply).div(_reserve1);

	return amount0.lte(amount1) ? amount0 : amount1;
}

export async function uniLiquidityMinted(
	fixture: Fixture,
	totalSupply: BigNumber = BigNumber.from(0),
	amountA: BigNumber = defaultAmountA,
	amountB: BigNumber = defaultAmountB,
): Promise<BigNumber> {
	return uniLiquidityMintedImpl(
		fixture,
		fixture.uniswapPool,
		totalSupply,
		amountA,
		amountB,
	);
}

export async function uniStake(
	fixture: Fixture,
	from?: string,
	amountA: BigNumberish = defaultAmountA,
	amountB: BigNumberish = defaultAmountB,
): Promise<BigNumber> {
	const { uniswapPool } = fixture;
	return stakeImpl(
		fixture,
		uniswapPool,
		uniAddLiquidity,
		from,
		amountA,
		amountB,
	);
}

export async function sushiAddLiquidity(
	fixture: Fixture,
	from?: string,
	amountA: BigNumberish = defaultAmountA,
	amountB: BigNumberish = defaultAmountB,
): Promise<BigNumber> {
	const { sushiswapPool } = fixture;
	return uniAddLiquidityImpl(fixture, sushiswapPool, from, amountA, amountB);
}

export async function sushiLiquidityMinted(
	fixture: Fixture,
	totalSupply: BigNumber = BigNumber.from(0),
	amountA: BigNumber = defaultAmountA,
	amountB: BigNumber = defaultAmountB,
): Promise<BigNumber> {
	return uniLiquidityMintedImpl(
		fixture,
		fixture.sushiswapPool,
		totalSupply,
		amountA,
		amountB,
	);
}

export async function sushiStake(
	fixture: Fixture,
	from?: string,
	amountA: BigNumberish = defaultAmountA,
	amountB: BigNumberish = defaultAmountB,
): Promise<BigNumber> {
	const { sushiswapPool } = fixture;
	return await stakeImpl(
		fixture,
		sushiswapPool,
		sushiAddLiquidity,
		from,
		amountA,
		amountB,
	);
}

export async function moonAddLiquidity(
	fixture: Fixture,
	from = '',
	amountA: BigNumberish = defaultAmountA,
	amountB: BigNumberish = defaultAmountB,
): Promise<BigNumber> {
	const {
		deployer,
		tester,
		tokenA,
		tokenB,
		mooniswapPool,
		testerMooniswapPool,
	} = fixture;
	if (from.length === 0) {
		from = deployer;
	}

	let poolHandle: Mooniswap;
	let tokenAHandle: MockERC20;
	let tokenBHandle: MockERC20;
	switch (from) {
		case tester:
			const signer = testerMooniswapPool.signer;
			poolHandle = testerMooniswapPool;
			tokenAHandle = tokenA.connect(signer);
			tokenBHandle = tokenB.connect(signer);
			break;
		case undefined:
		case deployer:
			poolHandle = mooniswapPool;
			tokenAHandle = tokenA;
			tokenBHandle = tokenB;
			break;
		default:
			throw Error('moonAddLiquidity: unsupported from parameter');
	}

	const initBalance = await mooniswapPool.balanceOf(from);

	await tokenA.mint(from, amountA);
	await tokenB.mint(from, amountB);

	await tokenAHandle.increaseAllowance(mooniswapPool.address, amountA);
	await tokenBHandle.increaseAllowance(mooniswapPool.address, amountB);

	const tokens = await mooniswapPool.getTokens();
	if (tokens.length === 0) {
		throw Error('moonAddLiquidity: no tokens for the pool');
	}

	let amount0;
	let amount1;
	if (tokenA.address === tokens[0]) {
		amount0 = amountA;
		amount1 = amountB;
	} else {
		amount0 = amountB;
		amount1 = amountA;
	}

	await poolHandle.deposit([amount0, amount1], [0, 0]);

	const newBalance = await mooniswapPool.balanceOf(from);

	return newBalance.sub(initBalance);
}

export async function moonLiquidityMinted(
	fixture: Fixture,
	totalSupply: BigNumber = BigNumber.from(0),
	amountA: BigNumber = defaultAmountA,
	amountB: BigNumber = defaultAmountB,
): Promise<BigNumber> {
	if (totalSupply.eq(0)) {
		let fairSupply = mooniswapBaseSupply.mul(99);
		const greaterAmount = amountA.gte(amountB) ? amountA : amountB;
		if (greaterAmount.gt(fairSupply)) {
			fairSupply = greaterAmount;
		}
		return fairSupply;
	}

	const { tokenA, tokenB, mooniswapPool } = fixture;

	const balanceA = await tokenA.balanceOf(mooniswapPool.address);
	const balanceB = await tokenB.balanceOf(mooniswapPool.address);

	let liqA = totalSupply.mul(amountA).div(balanceA);
	let liqB = totalSupply.mul(amountB).div(balanceB);
	let fairSupply = liqA.lte(liqB) ? liqA : liqB;

	const confirmedA = balanceA
		.mul(fairSupply)
		.add(totalSupply.sub(1))
		.div(totalSupply);
	const confirmedB = balanceB
		.mul(fairSupply)
		.add(totalSupply.sub(1))
		.div(totalSupply);

	liqA = totalSupply.mul(confirmedA).div(balanceA);
	liqB = totalSupply.mul(confirmedB).div(balanceB);
	fairSupply = liqA.lte(liqB) ? liqA : liqB;

	return fairSupply;
}

export async function moonStake(
	fixture: Fixture,
	from?: string,
	amountA: BigNumberish = defaultAmountA,
	amountB: BigNumberish = defaultAmountB,
): Promise<BigNumber> {
	const { mooniswapPool } = fixture;
	return await stakeImpl(
		fixture,
		mooniswapPool,
		moonAddLiquidity,
		from,
		amountA,
		amountB,
	);
}

export async function addRewards(
	fixture: Fixture,
	amount: BigNumberish = defaultRewards,
): Promise<BigNumber> {
	const { contract, rewardsToken } = fixture;
	await rewardsToken.mint(contract.address, amount);
	return BigNumber.from(amount);
}

export function accruedRewardsPerToken(
	totalStake: BigNumberish,
	rewards: BigNumberish = defaultRewards,
): BigNumber {
	return BigNumber.from(rewards).mul(roundingMultiplier).div(totalStake);
}

interface Shares {
	moon: BigNumber;
	sushi: BigNumber;
	uni: BigNumber;
	total: BigNumber;
}

export async function getCurrentShares(fixture: Fixture): Promise<Shares> {
	const { contract, mooniswapPool, sushiswapPool, uniswapPool } = fixture;

	const moon = await contract.currentSharesFor(mooniswapPool.address);
	const sushi = await contract.currentSharesFor(sushiswapPool.address);
	const uni = await contract.currentSharesFor(uniswapPool.address);
	const total = moon.add(sushi).add(uni);

	return { moon, sushi, uni, total };
}

export async function mineBlock(fixture: Fixture): Promise<void> {
	const { contract } = fixture;
	await mineBlockWithProvider(contract.provider as JsonRpcProvider);
}
