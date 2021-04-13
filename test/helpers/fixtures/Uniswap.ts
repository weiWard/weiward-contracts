import { Contract } from 'ethers';
import { waffle } from 'hardhat';
import type { ContractJSON } from 'ethereum-waffle/dist/esm/ContractJSON';
import UniswapV2Factory from '@uniswap/v2-core/build/UniswapV2Factory.json';
import UniswapV2Pair from '@uniswap/v2-core/build/UniswapV2Pair.json';

import { MockUniswapV2Router02__factory } from '../../../build/types/ethers-v5';

export interface FactoryFixture {
	factory: Contract;
}

export async function uniswapFactoryFixture(
	deployerAddress: string,
): Promise<FactoryFixture> {
	const factory = await waffle.deployContract(
		waffle.provider.getSigner(deployerAddress),
		UniswapV2Factory,
		[deployerAddress],
	);
	return { factory };
}

export interface PairFixture extends FactoryFixture {
	token0: Contract;
	token1: Contract;
	pair: Contract;
}

export async function uniswapPairFixtureImpl(
	deployerAddress: string,
	tokenA: Contract,
	tokenB: Contract,
	factoryJson: ContractJSON,
	pairJson: ContractJSON,
): Promise<PairFixture> {
	const deployerSigner = waffle.provider.getSigner(deployerAddress);

	const factory = await waffle.deployContract(deployerSigner, factoryJson, [
		deployerAddress,
	]);

	await factory.createPair(tokenA.address, tokenB.address);
	const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
	const pair = new Contract(
		pairAddress,
		JSON.stringify(pairJson.abi),
		deployerSigner,
	);

	const token0Address = (await pair.token0()).address;
	const token0 = tokenA.address === token0Address ? tokenA : tokenB;
	const token1 = tokenA.address === token0Address ? tokenB : tokenA;

	return { factory, token0, token1, pair };
}

export type uniswapPairFixtureFn = (
	deployerAddress: string,
	tokenA: Contract,
	tokenB: Contract,
) => Promise<PairFixture>;

export async function uniswapPairFixture(
	deployerAddress: string,
	tokenA: Contract,
	tokenB: Contract,
): Promise<PairFixture> {
	return uniswapPairFixtureImpl(
		deployerAddress,
		tokenA,
		tokenB,
		UniswapV2Factory,
		UniswapV2Pair,
	);
}

export interface RouterFixture extends FactoryFixture {
	router: Contract;
}

export async function uniswapRouterFixture(
	deployerAddress: string,
	wethAddress: string,
): Promise<RouterFixture> {
	const deployerSigner = waffle.provider.getSigner(deployerAddress);

	const factory = await waffle.deployContract(
		deployerSigner,
		UniswapV2Factory,
		[deployerAddress],
	);

	const router = await new MockUniswapV2Router02__factory(
		deployerSigner,
	).deploy(factory.address, wethAddress);

	return { factory, router };
}
