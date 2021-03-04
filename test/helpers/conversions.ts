import { parseUnits } from 'ethers/lib/utils';
import { BigNumber } from '@ethersproject/bignumber';

export function parseETHmx(value: string): BigNumber {
	return parseUnits(value, 18);
}

export function parseETHtx(value: string): BigNumber {
	return parseUnits(value, 18);
}

export function parseGwei(value: string): BigNumber {
	return parseUnits(value, 9);
}
