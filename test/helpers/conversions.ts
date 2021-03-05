import { parseUnits } from 'ethers/lib/utils';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { WETH9 } from '@contracts/ethers-v5';

export const GAS_PER_ETHTX = 21000;

export function parseETHmx(value: string): BigNumber {
	return parseUnits(value, 18);
}

export function parseETHtx(value: string): BigNumber {
	return parseUnits(value, 18);
}

export function parseGwei(value: string): BigNumber {
	return parseUnits(value, 9);
}

export async function sendWETH(
	weth: WETH9,
	dst: string,
	amount: BigNumberish,
): Promise<void> {
	await weth.deposit({ value: amount });
	await weth.transfer(dst, amount);
}

export function ethToEthtx(
	gasPrice: BigNumber,
	amountETH: BigNumber,
): BigNumber {
	const num = amountETH.mul(parseETHtx('1'));
	const den = gasPrice.mul(GAS_PER_ETHTX);
	return num.div(den);
}

export function ethtxToEth(
	gasPrice: BigNumber,
	amountETHtx: BigNumber,
): BigNumber {
	return gasPrice.mul(amountETHtx).mul(GAS_PER_ETHTX).div(parseETHtx('1'));
}
