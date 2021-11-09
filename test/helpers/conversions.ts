import { parseEther, parseUnits } from 'ethers/lib/utils';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { ContractTransaction } from '@ethersproject/contracts';
import { Zero } from '@ethersproject/constants';

import { WETH9 } from '@contracts/ethers-v5';

export const GAS_PER_ETHTX = 21000;
export const GENESIS_AMOUNT = parseEther('3000');
export const GENESIS_START = 1620655200; // 05/10/2021 1400 UTC
export const GENESIS_END = 1621260000; // 05/17/2021 1400 UTC

export interface IETHmxMintParams {
	cCapNum: BigNumberish;
	cCapDen: BigNumberish;
	zetaFloorNum: BigNumberish;
	zetaFloorDen: BigNumberish;
	zetaCeilNum: BigNumberish;
	zetaCeilDen: BigNumberish;
}

export interface IETHtxMintParams {
	minMintPrice: BigNumber;
	mu: BigNumberish;
	lambda: BigNumberish;
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
	return (await tx.wait()).gasUsed.mul(tx.gasPrice!);
}

export function ethmxFromEth(
	totalGiven: BigNumber,
	amountETH: BigNumber,
	cRatio: { num: BigNumber; den: BigNumber },
	cTarget: { num: BigNumberish; den: BigNumberish },
	mp: IETHmxMintParams,
	inGenesis = false,
): BigNumber {
	if (amountETH.isZero()) {
		return Zero;
	}

	let amtOut = ethmxCurve(amountETH, cRatio, cTarget, mp);

	if (inGenesis) {
		const totalEnd = totalGiven.add(amountETH);
		if (totalEnd.gt(GENESIS_AMOUNT)) {
			// Exiting genesis
			const amtUnder = GENESIS_AMOUNT.sub(totalGiven);
			amtOut = amtOut.sub(amtUnder.mul(amtOut).div(amountETH));
			const added = amtUnder.mul(2).mul(mp.zetaFloorNum).div(mp.zetaFloorDen);
			return amtOut.add(added);
		}

		return amtOut.mul(2);
	}

	return amtOut;
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

// function mintedEthtxFromEth(
// 	amountETH: BigNumber,
// 	gasPrice: BigNumber,
// 	initCollateral: BigNumber,
// 	liability: BigNumber,
// 	cTarget: { num: BigNumberish; den: BigNumberish },
// 	mp: IETHtxMintParams,
// ): BigNumber {
// 	if (amountETH.isZero()) {
// 		return Zero;
// 	}

// 	const basePrice = gasPrice.mul(mp.mu).add(mp.minMintPrice);

// 	if (liability.isZero()) {
// 		return ethToEthtx(basePrice, amountETH);
// 	}

// 	const ethTarget = liability.mul(cTarget.num).div(cTarget.den);

// 	if (initCollateral.lt(ethTarget)) {
// 		const ethEnd = initCollateral.add(amountETH);
// 		if (ethEnd.lte(ethTarget)) {
// 			return Zero;
// 		}
// 		amountETH = ethEnd.sub(ethTarget);
// 		initCollateral = ethTarget;
// 	}

// 	const firstTerm = basePrice.mul(amountETH);

// 	const collatDiff = initCollateral.sub(liability);
// 	const coeffA = liability.mul(mp.lambda).mul(gasPrice);
// 	const scale = BigNumber.from(10).pow(18);

// 	const secondTerm = basePrice.mul(collatDiff).add(coeffA).mul(scale).ln().mul(coeffA).div(scale);

// 	const thirdTerm = basePrice
// 		.mul(collatDiff.add(amountETH))
// 		.add(coeffA)
// 		.mul(scale)
// 		.ln()
// 		.mul(coeffA)
// 		.div(scale);

// 	const numerator = firstTerm.add(secondTerm).sub(thirdTerm).mul(scale);
// 	const denominator = basePrice.pow(2).mul(GAS_PER_ETHTX);
// 	return numerator.div(denominator);
// }
