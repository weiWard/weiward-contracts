import { deployments } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcSigner } from '@ethersproject/providers';

import {
	MockERC20,
	MockERC20__factory,
	Mooniswap,
	MockLPRewards,
	MockLPRewards__factory,
	ValuePerUNIV2,
	ValuePerUNIV2__factory,
	ValuePerMoonV1,
	ValuePerMoonV1__factory,
	WETH9__factory,
	WETH9,
} from '../../../build/types/ethers-v5';
import {
	mooniswapFixture,
	sushiswapPairFixture,
	uniswapPairFixture,
} from '../../helpers/fixtures';
import { sqrt } from '../../helpers/math';
import { sendWETH } from '../../helpers/conversions';

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

export const roundingMultiplier = BigNumber.from(10).pow(36);

export const mooniswapBaseSupply = BigNumber.from(1000);
export const uniswapMinLiquidity = BigNumber.from(1000);

export interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: MockLPRewards;
	contractImpl: MockLPRewards;
	testerContract: MockLPRewards;
	tokenA: MockERC20;
	tokenB: WETH9;
	rewardsToken: WETH9;
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
	async ({ deployments, getNamedAccounts, waffle }) => {
		const { deploy } = deployments;
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		// Deploy mock ERC20s
		const tokenA = await new MockERC20__factory(deployerSigner).deploy(
			'Token A',
			'AERC20',
			tokenADecimals,
			0,
		);
		const tokenB = await new WETH9__factory(deployerSigner).deploy();
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
		).deploy(mooniswapPool.address, tokenB.address);

		const { pair: sushiswapPool } = await sushiswapPairFixture(
			deployer,
			tokenA,
			tokenB,
		);
		const testerSushiswapPool = sushiswapPool.connect(testerSigner);
		const valuePerSushi = await new ValuePerUNIV2__factory(
			deployerSigner,
		).deploy(sushiswapPool.address, tokenB.address);

		const { pair: uniswapPool } = await uniswapPairFixture(
			deployer,
			tokenA,
			tokenB,
		);
		const testerUniswapPool = uniswapPool.connect(testerSigner);
		const valuePerUNIV2 = await new ValuePerUNIV2__factory(
			deployerSigner,
		).deploy(uniswapPool.address, tokenB.address);

		const { pair: testPool } = await uniswapPairFixture(
			deployer,
			tokenA,
			tokenB,
		);
		const valuePerTest = await new ValuePerUNIV2__factory(
			deployerSigner,
		).deploy(testPool.address, tokenB.address);

		// Deploy contract
		const result = await deploy('MockLPRewards', {
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
		const contract = MockLPRewards__factory.connect(
			result.address,
			deployerSigner,
		);
		await contract.setRewardsToken(rewardsToken.address);

		const contractImpl = MockLPRewards__factory.connect(
			(await deployments.get('MockLPRewards_Implementation')).address,
			deployerSigner,
		);

		const testerContract = contract.connect(testerSigner);

		// Add support for tokens
		await contract.addToken(mooniswapPool.address, valuePerMoonV1.address);
		await contract.addToken(sushiswapPool.address, valuePerSushi.address);
		await contract.addToken(uniswapPool.address, valuePerUNIV2.address);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			contractImpl,
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
		amountA: BigNumberish,
		amountB: BigNumberish,
		signer?: JsonRpcSigner,
	) => Promise<BigNumber>,
	amountA: BigNumberish,
	amountB: BigNumberish,
	signer?: JsonRpcSigner,
): Promise<BigNumber> {
	const { contract, deployerSigner } = fixture;

	if (!signer) {
		signer = deployerSigner;
	}

	const lpAmount = await addLiquidity(fixture, amountA, amountB, signer);
	await pool.connect(signer).approve(contract.address, lpAmount);
	await contract.connect(signer).stake(pool.address, lpAmount);

	return lpAmount;
}

async function uniAddLiquidityImpl(
	fixture: Fixture,
	pool: Contract,
	amountA: BigNumberish,
	amountB: BigNumberish,
	signer?: JsonRpcSigner,
): Promise<BigNumber> {
	const { deployerSigner, tokenA, tokenB } = fixture;

	if (!signer) {
		signer = deployerSigner;
	}
	const from = await signer.getAddress();

	const initBalance: BigNumber = await pool.balanceOf(from);

	await tokenA.mint(pool.address, amountA);
	// await tokenB.mint(pool.address, amountB);
	await sendWETH(tokenB, pool.address, amountB);
	await pool.mint(from);

	const newBalance: BigNumber = await pool.balanceOf(from);

	return newBalance.sub(initBalance);
}

export async function uniAddLiquidity(
	fixture: Fixture,
	amountA: BigNumberish,
	amountB: BigNumberish,
	signer?: JsonRpcSigner,
): Promise<BigNumber> {
	const { uniswapPool } = fixture;
	return uniAddLiquidityImpl(fixture, uniswapPool, amountA, amountB, signer);
}

export async function uniLiquidityMintedImpl(
	fixture: Fixture,
	pool: Contract,
	amountA: BigNumber,
	amountB: BigNumber,
	totalSupply: BigNumber = BigNumber.from(0),
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
	amountA: BigNumber,
	amountB: BigNumber,
	totalSupply: BigNumber = BigNumber.from(0),
): Promise<BigNumber> {
	return uniLiquidityMintedImpl(
		fixture,
		fixture.uniswapPool,
		amountA,
		amountB,
		totalSupply,
	);
}

export async function uniStake(
	fixture: Fixture,
	amountA: BigNumberish,
	amountB: BigNumberish,
	signer?: JsonRpcSigner,
): Promise<BigNumber> {
	const { uniswapPool } = fixture;
	return stakeImpl(
		fixture,
		uniswapPool,
		uniAddLiquidity,
		amountA,
		amountB,
		signer,
	);
}

export async function sushiAddLiquidity(
	fixture: Fixture,
	amountA: BigNumberish,
	amountB: BigNumberish,
	signer?: JsonRpcSigner,
): Promise<BigNumber> {
	const { sushiswapPool } = fixture;
	return uniAddLiquidityImpl(fixture, sushiswapPool, amountA, amountB, signer);
}

export async function sushiLiquidityMinted(
	fixture: Fixture,
	amountA: BigNumber,
	amountB: BigNumber,
	totalSupply: BigNumber = BigNumber.from(0),
): Promise<BigNumber> {
	return uniLiquidityMintedImpl(
		fixture,
		fixture.sushiswapPool,
		amountA,
		amountB,
		totalSupply,
	);
}

export async function sushiStake(
	fixture: Fixture,
	amountA: BigNumberish,
	amountB: BigNumberish,
	signer?: JsonRpcSigner,
): Promise<BigNumber> {
	const { sushiswapPool } = fixture;
	return await stakeImpl(
		fixture,
		sushiswapPool,
		sushiAddLiquidity,
		amountA,
		amountB,
		signer,
	);
}

export async function moonAddLiquidity(
	fixture: Fixture,
	amountA: BigNumberish,
	amountB: BigNumberish,
	signer?: JsonRpcSigner,
): Promise<BigNumber> {
	const { deployerSigner, tokenA, tokenB, mooniswapPool } = fixture;

	if (!signer) {
		signer = deployerSigner;
	}
	const from = await signer.getAddress();

	const initBalance = await mooniswapPool.balanceOf(from);

	await tokenA.mint(from, amountA);
	// await tokenB.mint(from, amountB);
	await sendWETH(tokenB, from, amountB);

	await tokenA
		.connect(signer)
		.increaseAllowance(mooniswapPool.address, amountA);
	// await tokenB
	// 	.connect(signer)
	// 	.increaseAllowance(mooniswapPool.address, amountB);
	const allowance = await tokenB
		.connect(signer)
		.allowance(from, mooniswapPool.address);
	await tokenB
		.connect(signer)
		.approve(mooniswapPool.address, allowance.add(amountB));

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

	await mooniswapPool.connect(signer).deposit([amount0, amount1], [0, 0]);

	const newBalance = await mooniswapPool.balanceOf(from);

	return newBalance.sub(initBalance);
}

export async function moonLiquidityMinted(
	fixture: Fixture,
	amountA: BigNumber,
	amountB: BigNumber,
	totalSupply: BigNumber = BigNumber.from(0),
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
	amountA: BigNumberish,
	amountB: BigNumberish,
	signer?: JsonRpcSigner,
): Promise<BigNumber> {
	const { mooniswapPool } = fixture;
	return await stakeImpl(
		fixture,
		mooniswapPool,
		moonAddLiquidity,
		amountA,
		amountB,
		signer,
	);
}

export async function addRewards(
	fixture: Fixture,
	amount: BigNumberish,
): Promise<BigNumber> {
	const { contract, rewardsToken } = fixture;
	const amountBig = BigNumber.from(amount);
	// await rewardsToken.mint(contract.address, amountBig);
	await sendWETH(rewardsToken, contract.address, amountBig);
	return amountBig;
}

export function arpt(
	totalStake: BigNumberish,
	rewards: BigNumberish,
): BigNumber {
	return BigNumber.from(rewards).mul(roundingMultiplier).div(totalStake);
}

export interface Shares {
	moon: BigNumber;
	sushi: BigNumber;
	uni: BigNumber;
	total: BigNumber;
}

export async function getTotalShares(fixture: Fixture): Promise<Shares> {
	const { contract, mooniswapPool, sushiswapPool, uniswapPool } = fixture;

	const moon = await contract.totalSharesForToken(mooniswapPool.address);
	const sushi = await contract.totalSharesForToken(sushiswapPool.address);
	const uni = await contract.totalSharesForToken(uniswapPool.address);
	const total = moon.add(sushi).add(uni);

	return { moon, sushi, uni, total };
}
