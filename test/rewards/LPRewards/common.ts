import { deployments } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';

import {
	MockERC20,
	LPRewards,
	Mooniswap,
	MockERC20__factory,
	LPRewards__factory,
	ValuePerUNIV2__factory,
	ValuePerMoonV1__factory,
} from '../../../build/types/ethers-v5';
import {
	mooniswapFixture,
	sushiswapPairFixture,
	uniswapPairFixture,
} from '../../helpers/fixtures';

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

export const defaultAmountA = parseTokenA('10000');
export const defaultAmountB = parseTokenB('50');
export const defaultRewards = parseRewardsToken('5');

export const defaultAmounts = {
	a: defaultAmountA,
	b: defaultAmountB,
	rewards: defaultRewards,
};

export interface Fixture {
	deployer: string;
	tester: string;
	contract: LPRewards;
	testerContract: LPRewards;
	tokenA: MockERC20;
	tokenB: MockERC20;
	rewardsToken: MockERC20;
	mooniswapPool: Mooniswap;
	testerMooniswapPool: Mooniswap;
	sushiswapPool: Contract;
	testerSushiswapPool: Contract;
	uniswapPool: Contract;
	testerUniswapPool: Contract;
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

		// Deploy contract
		const contract = await new LPRewards__factory(deployerSigner).deploy(
			rewardsToken.address,
		);
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
			sushiswapPool,
			testerSushiswapPool,
			uniswapPool,
			testerUniswapPool,
		};
	},
);

export async function uniAddLiquidity(
	fixture: Fixture,
	from = '',
	amountA: BigNumberish = defaultAmountA,
	amountB: BigNumberish = defaultAmountB,
): Promise<BigNumber> {
	const { deployer, tokenA, tokenB, uniswapPool } = fixture;
	if (from.length === 0) {
		from = deployer;
	}

	const initBalance: BigNumber = await uniswapPool.balanceOf(from);

	await tokenA.mint(uniswapPool.address, amountA);
	await tokenB.mint(uniswapPool.address, amountB);
	await uniswapPool.mint(from);

	const newBalance: BigNumber = await uniswapPool.balanceOf(from);

	return newBalance.sub(initBalance);
}

export const sushiAddLiquidity = uniAddLiquidity;

export async function moonAddLiquidity(
	fixture: Fixture,
	from = '',
	amountA: BigNumberish = defaultAmountA,
	amountB: BigNumberish = defaultAmountB,
): Promise<BigNumber> {
	const { deployer, tokenA, tokenB, mooniswapPool } = fixture;
	if (from.length === 0) {
		from = deployer;
	}

	const initBalance = await mooniswapPool.balanceOf(from);

	await tokenA.mint(from, amountA);
	await tokenB.mint(from, amountB);

	await tokenA.increaseAllowance(mooniswapPool.address, amountA);
	await tokenB.increaseAllowance(mooniswapPool.address, amountB);

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

	await mooniswapPool.deposit([amount0, amount1], [0, 0]);

	const newBalance = await mooniswapPool.balanceOf(from);

	return newBalance.sub(initBalance);
}
