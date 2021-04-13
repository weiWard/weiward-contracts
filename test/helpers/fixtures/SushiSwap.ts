import { Contract } from 'ethers';
import { waffle } from 'hardhat';
import UniswapV2Pair from '@sushiswap/core/build/contracts/UniswapV2Pair.json';

import SushiV2Factory from '../../../contracts/exchanges/mocks/SushiV2Factory.json';
import { MockSushiV2Router02__factory } from '../../../build/types/ethers-v5';

import {
	FactoryFixture,
	PairFixture,
	RouterFixture,
	uniswapPairFixtureImpl,
} from './Uniswap';

export async function sushiswapFactoryFixture(
	deployerAddress: string,
): Promise<FactoryFixture> {
	const factory = await waffle.deployContract(
		waffle.provider.getSigner(deployerAddress),
		SushiV2Factory,
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
		SushiV2Factory,
		UniswapV2Pair,
	);
}

export async function sushiswapRouterFixture(
	deployerAddress: string,
	wethAddress: string,
): Promise<RouterFixture> {
	const deployerSigner = waffle.provider.getSigner(deployerAddress);

	const factory = await waffle.deployContract(deployerSigner, SushiV2Factory, [
		deployerAddress,
	]);

	const router = await new MockSushiV2Router02__factory(deployerSigner).deploy(
		factory.address,
		wethAddress,
	);

	return { factory, router };
}
