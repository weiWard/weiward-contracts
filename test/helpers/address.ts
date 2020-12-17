import { hexZeroPad } from 'ethers/lib/utils';

export function zeroPadAddress(short: string): string {
	return hexZeroPad(short, 20);
}

export const zeroAddress = zeroPadAddress('0x0');
