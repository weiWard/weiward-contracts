import { Contract, Signer } from 'ethers';
import { BigNumber } from '@ethersproject/bignumber';

import {
	MooniFactory,
	MooniFactory__factory,
	Mooniswap,
	Mooniswap__factory,
} from '../../../build/types/ethers-v5';

export interface PoolFixture {
	factory: MooniFactory;
	token0: Contract;
	token1: Contract;
	pool: Mooniswap;
}

export async function mooniswapFixture(
	signer: Signer,
	tokenA: Contract,
	tokenB: Contract,
): Promise<PoolFixture> {
	const factory = await new MooniFactory__factory(signer).deploy();

	await factory.deploy(tokenA.address, tokenB.address);
	const poolAddress = await factory.pools(tokenA.address, tokenB.address);
	const pool = Mooniswap__factory.connect(poolAddress, signer);

	const { token0, token1 } = sortTokens(tokenA, tokenB);

	return { factory, token0, token1, pool };
}

// Equivalent to MooniFactory.sortTokens
export function sortTokens(
	tokenA: Contract,
	tokenB: Contract,
): { token0: Contract; token1: Contract } {
	let token0: Contract;
	let token1: Contract;

	if (BigNumber.from(tokenA.address).lt(tokenB.address)) {
		token0 = tokenA;
		token1 = tokenB;
	} else {
		token0 = tokenB;
		token1 = tokenA;
	}

	return { token0, token1 };
}
