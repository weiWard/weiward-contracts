import { Contract } from 'ethers';
import { waffle } from 'hardhat';
import UniswapV2Factory from '@sushiswap/core/build/contracts/UniswapV2Factory.json';
import UniswapV2Pair from '@sushiswap/core/build/contracts/UniswapV2Pair.json';

import {
	FactoryFixture,
	PairFixture,
	uniswapPairFixtureImpl,
} from './Uniswap';

export async function sushiswapFactoryFixture(
	deployerAddress: string,
): Promise<FactoryFixture> {
	const factory = await waffle.deployContract(
		waffle.provider.getSigner(deployerAddress),
		UniswapV2Factory,
		[deployerAddress],
	);
	return { factory };
}

export async function sushiswapPairFixture(
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
