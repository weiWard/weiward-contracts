import { deployments } from 'hardhat';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { JsonRpcSigner } from '@ethersproject/providers';

import { zeroAddress, zeroPadAddress } from '../../helpers/address';
import { parseGwei } from '../../helpers/conversions';
import {
	MockETHmxRewards,
	MockETHmxRewards__factory,
	ETHmx,
	ETHmx__factory,
	MockETHtx,
	MockETHtx__factory,
	FeeLogic__factory,
	WETH9__factory,
	SimpleGasPrice__factory,
	WETH9,
	FeeLogic,
	ETHtxAMM__factory,
} from '../../../build/types/ethers-v5';

export const mintGasPrice = parseGwei('1800');
export const roiNumerator = 5;
export const roiDenominator = 1;
export const feeRecipient = zeroPadAddress('0x1');
export const roundingFactor = BigNumber.from(10).pow(36);
export const accrualUpdateInterval = 3600; // 1 hour

export function ethToEthmx(amountETH: BigNumber): BigNumber {
	return amountETH.mul(roiNumerator).div(roiDenominator);
}
export function ethmxToEth(amountETHmx: BigNumber): BigNumber {
	return amountETHmx.mul(roiDenominator).div(roiNumerator);
}

export interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: MockETHmxRewards;
	testerContract: MockETHmxRewards;
	ethmx: ETHmx;
	ethtx: MockETHtx;
	feeLogic: FeeLogic;
	weth: WETH9;
}

export const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ getNamedAccounts, waffle }) => {
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const feeLogic = await new FeeLogic__factory(deployerSigner).deploy(
			feeRecipient,
			75,
			1000,
		);

		const oracle = await new SimpleGasPrice__factory(deployerSigner).deploy(
			parseGwei('200'),
		);

		const weth = await new WETH9__factory(deployerSigner).deploy();

		const ethtx = await new MockETHtx__factory(deployerSigner).deploy(
			feeLogic.address,
			zeroAddress, // ethmx address
		);

		const ethtxAMM = await new ETHtxAMM__factory(deployerSigner).deploy(
			ethtx.address,
			oracle.address,
			weth.address,
			2,
			1,
		);
		await feeLogic.setExempt(ethtxAMM.address, true);

		const ethmx = await new ETHmx__factory(deployerSigner).deploy(
			ethtx.address,
			ethtxAMM.address,
			weth.address,
			mintGasPrice,
			roiNumerator,
			roiDenominator,
			0,
		);
		await ethtx.setMinter(ethmx.address);

		const contract = await new MockETHmxRewards__factory(
			deployerSigner,
		).deploy(ethmx.address, weth.address, accrualUpdateInterval);
		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			testerContract,
			ethmx,
			ethtx,
			feeLogic,
			weth,
		};
	},
);

export async function addRewards(
	fixture: Fixture,
	amount: BigNumberish,
): Promise<void> {
	const { contract, weth } = fixture;
	await weth.deposit({ value: amount });
	await weth.transfer(contract.address, amount);
}

export async function stake(
	fixture: Fixture,
	amountETHmx: BigNumber,
	signer?: JsonRpcSigner,
): Promise<void> {
	let { contract, ethmx } = fixture;
	if (signer) {
		contract = contract.connect(signer);
		ethmx = ethmx.connect(signer);
	}

	await ethmx.mint({ value: ethmxToEth(amountETHmx) });
	await ethmx.increaseAllowance(contract.address, amountETHmx);
	await contract.stake(amountETHmx);
}
