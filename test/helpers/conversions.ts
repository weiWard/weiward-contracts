import { parseUnits } from 'ethers/lib/utils';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { WETH9 } from '@contracts/ethers-v5';
import { ContractTransaction } from 'ethers';

export const GAS_PER_ETHTX = 21000;

export interface IETHmxMintParams {
	earlyThreshold: BigNumber;
	cCapNum: BigNumberish;
	cCapDen: BigNumberish;
	zetaFloorNum: BigNumberish;
	zetaFloorDen: BigNumberish;
	zetaCeilNum: BigNumberish;
	zetaCeilDen: BigNumberish;
}

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

export async function ethUsedOnGas(
	tx: ContractTransaction,
): Promise<BigNumber> {
	return (await tx.wait()).gasUsed.mul(tx.gasPrice);
}

export function ethmxFromEth(
	totalGiven: BigNumber,
	amountETH: BigNumber,
	cRatio: { num: BigNumber; den: BigNumber },
	cTarget: { num: BigNumberish; den: BigNumberish },
	mp: IETHmxMintParams,
): BigNumber {
	let amtOut = ethmxCurve(amountETH, cRatio, cTarget, mp);

	// Scale for output
	const et = BigNumber.from(mp.earlyThreshold).mul(amtOut).div(amountETH);
	totalGiven = totalGiven.mul(amtOut).div(amountETH);

	// Apply early-bird multiplier
	if (totalGiven.lt(et)) {
		const start = ethmxMinterEarlyMultIntegral(totalGiven, et);

		const currentLeft = et.sub(totalGiven);
		if (amtOut.lt(currentLeft)) {
			const end = ethmxMinterEarlyMultIntegral(totalGiven.add(amtOut), et);
			amtOut = end.sub(start);
		} else {
			const end = ethmxMinterEarlyMultIntegral(et, et);
			const added = end.sub(start).sub(currentLeft);
			amtOut = amtOut.add(added);
		}
	}

	return amtOut;
}

function ethmxMinterEarlyMultIntegral(
	amountETH: BigNumber,
	earlyThreshold: BigNumber,
): BigNumber {
	return amountETH
		.mul(2)
		.sub(amountETH.mul(amountETH).div(earlyThreshold.mul(2)));
}

function ethmxCurve(
	amountETH: BigNumber,
	cRatio: { num: BigNumber; den: BigNumber },
	cTarget: { num: BigNumberish; den: BigNumberish },
	mp: IETHmxMintParams,
): BigNumber {
	const floor = amountETH.mul(mp.zetaFloorNum).div(mp.zetaFloorDen);
	const ceil = amountETH.mul(mp.zetaCeilNum).div(mp.zetaCeilDen);

	if (cRatio.den.isZero()) {
		// cRatio > cCap
		return floor;
	}

	const initEth = cRatio.num;
	const liability = cRatio.den;
	const endEth = initEth.add(amountETH);
	const targetEth = liability.mul(cTarget.num).div(cTarget.den);
	const capEth = liability.mul(mp.cCapNum).div(mp.cCapDen);

	if (initEth.gte(capEth)) {
		// cRatio > cCap
		return floor;
	}

	if (initEth.lt(targetEth)) {
		// cRatio < cTarget
		if (endEth.gt(capEth)) {
			// Add definite integral
			const curveAmt = ethmxCurveDefiniteIntegral(
				capEth.sub(targetEth),
				targetEth,
				liability,
				cTarget,
				mp,
			);

			// Add amount past cap
			const pastCapAmt = endEth
				.sub(capEth)
				.mul(mp.zetaFloorNum)
				.div(mp.zetaFloorDen);

			// Add initial amount
			const flatAmt = targetEth
				.sub(initEth)
				.mul(mp.zetaCeilNum)
				.div(mp.zetaCeilDen);

			return flatAmt.add(curveAmt).add(pastCapAmt);
		} else if (endEth.gt(targetEth)) {
			// Add definite integral for partial amount
			const ethOver = endEth.sub(targetEth);
			const curveAmt = ethmxCurveDefiniteIntegral(
				ethOver,
				targetEth,
				liability,
				cTarget,
				mp,
			);

			// Add initial amount
			const flatAmt = amountETH
				.sub(ethOver)
				.mul(mp.zetaCeilNum)
				.div(mp.zetaCeilDen);

			return flatAmt.add(curveAmt);
		}

		return ceil;
	}

	// cTarget < cRatio < cCap
	if (endEth.gt(capEth)) {
		const ethOver = endEth.sub(capEth);
		const curveAmt = ethmxCurveDefiniteIntegral(
			amountETH.sub(ethOver),
			initEth,
			liability,
			cTarget,
			mp,
		);

		const flatAmt = ethOver.mul(mp.zetaFloorNum).div(mp.zetaFloorDen);

		return curveAmt.add(flatAmt);
	}

	return ethmxCurveDefiniteIntegral(
		amountETH,
		initEth,
		liability,
		cTarget,
		mp,
	);
}

function ethmxCurveDefiniteIntegral(
	amountETH: BigNumber,
	initCollateral: BigNumber,
	liability: BigNumber,
	cTarget: { num: BigNumberish; den: BigNumberish },
	mp: IETHmxMintParams,
): BigNumber {
	const fctMulNum = BigNumber.from(mp.zetaFloorNum)
		.mul(mp.zetaCeilDen)
		.mul(cTarget.den);
	const fctMulDen = BigNumber.from(mp.zetaFloorDen)
		.mul(mp.zetaCeilNum)
		.mul(cTarget.num);

	const first = amountETH
		.mul(fctMulNum.mul(mp.cCapNum))
		.div(fctMulDen.mul(mp.cCapDen));

	const second = amountETH.mul(mp.zetaFloorNum).div(mp.zetaFloorDen);

	const tNum = fctMulNum.mul(amountETH);
	const tDen = fctMulDen.mul(2).mul(liability);
	const third = initCollateral.mul(2).add(amountETH).mul(tNum).div(tDen);

	return first.add(second).sub(third);
}
