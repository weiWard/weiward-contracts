import { BigNumber } from '@ethersproject/bignumber';

export function sqrt(y: BigNumber): BigNumber {
	let z: BigNumber = BigNumber.from(0);
	let x: BigNumber;
	if (y.gt(3)) {
		z = y;
		x = y.div(2).add(1);
		while (x.lt(z)) {
			z = x;
			x = y.div(x).add(x).div(2);
		}
	} else if (y.gt(0)) {
		z = BigNumber.from(1);
	}
	return z;
}
