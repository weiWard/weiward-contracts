import { JsonRpcProvider } from '@ethersproject/providers';

export async function mineBlock(provider: JsonRpcProvider): Promise<void> {
	await provider.send('evm_mine', []);
}

export async function mineBlocks(
	provider: JsonRpcProvider,
	n: number,
): Promise<void> {
	for (let i = 0; i < n; i++) {
		await mineBlock(provider);
	}
}

export async function setBlockTime(
	provider: JsonRpcProvider,
	timestamp: number,
): Promise<void> {
	await provider.send('evm_setNextBlockTimestamp', [timestamp]);
	await mineBlock(provider);
}
