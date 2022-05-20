import { deployments } from 'hardhat';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { JsonRpcSigner } from '@ethersproject/providers';

import { zeroAddress, zeroPadAddress } from '../../helpers/address';
import { parseGwei } from '../../helpers/conversions';
import {
	MockETHmxRewardsv1 as MockETHmxRewards,
	MockETHmxRewardsv1__factory as MockETHmxRewards__factory,
	MockETHmx,
	MockETHmx__factory,
	ETHmxMinterv1 as ETHmxMinter,
	ETHmxMinterv1__factory as ETHmxMinter__factory,
	MockETHtx,
	MockETHtx__factory,
	FeeLogic__factory,
	WETH9__factory,
	SimpleGasPrice__factory,
	WETH9,
	FeeLogic,
	ETHtxAMMv1__factory as ETHtxAMM__factory,
} from '../../../build/types/ethers-v5';

export const defaultGasPrice = parseGwei('200');
export const mintGasPrice = parseGwei('1000');
export const roiNumerator = 5;
export const roiDenominator = 1;
export const feeRecipient = zeroPadAddress('0x1');
export const roundingFactor = BigNumber.from(10).pow(36);
export const accrualUpdateInterval = 3600; // 1 hour

export interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: MockETHmxRewards;
	contractImpl: MockETHmxRewards;
	testerContract: MockETHmxRewards;
	ethmx: MockETHmx;
	ethmxMinter: ETHmxMinter;
	ethtx: MockETHtx;
	feeLogic: FeeLogic;
	weth: WETH9;
}

export const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ deployments, getNamedAccounts, waffle }) => {
		const { deploy } = deployments;
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const feeLogic = await new FeeLogic__factory(deployerSigner).deploy({
			owner: deployer,
			recipient: feeRecipient,
			feeRateNumerator: 75,
			feeRateDenominator: 1000,
			exemptions: [],
			rebaseInterval: 0,
			rebaseFeeRateNum: 0,
			rebaseFeeRateDen: 1,
			rebaseExemptions: [],
		});

		const oracle = await new SimpleGasPrice__factory(deployerSigner).deploy(
			defaultGasPrice,
		);

		const weth = await new WETH9__factory(deployerSigner).deploy();

		const ethtx = await new MockETHtx__factory(deployerSigner).deploy(
			deployer,
		);

		const ethmx = await new MockETHmx__factory(deployerSigner).deploy(
			deployer,
		);

		const ethtxAMM = await new ETHtxAMM__factory(deployerSigner).deploy(
			deployer,
		);
		await ethtxAMM.postInit({
			ethtx: ethtx.address,
			gasOracle: oracle.address,
			weth: weth.address,
			targetCRatioNum: 2,
			targetCRatioDen: 1,
			ethmx: ethmx.address,
		});
		await feeLogic.setExempt(ethtxAMM.address, true);

		const ethmxMinter = await new ETHmxMinter__factory(deployerSigner).deploy(
			deployer,
		);
		await ethmxMinter.postInit({
			ethmx: ethmx.address,
			ethtx: ethtx.address,
			ethtxAMM: ethtxAMM.address,
			weth: weth.address,
			ethtxMintParams: {
				minMintPrice: parseGwei('50'),
				mu: 5,
				lambda: 4,
			},
			ethmxMintParams: {
				cCapNum: 10,
				cCapDen: 1,
				zetaFloorNum: 2,
				zetaFloorDen: 1,
				zetaCeilNum: 4,
				zetaCeilDen: 1,
			},
			lpShareNumerator: 25,
			lpShareDenominator: 100,
			lps: [],
			lpRecipient: zeroAddress,
		});
		await ethmx.setMinter(ethmxMinter.address);
		await ethtx.postInit({
			feeLogic: feeLogic.address,
			minters: [ethmxMinter.address],
			rebasers: [],
		});

		const result = await deploy('MockETHmxRewards', {
			from: deployer,
			log: true,
			proxy: {
				owner: deployer,
				methodName: 'init',
				proxyContract: 'OpenZeppelinTransparentProxy',
				viaAdminContract: 'ProxyAdmin',
			},
			args: [deployer],
		});
		const contract = MockETHmxRewards__factory.connect(
			result.address,
			deployerSigner,
		);
		await contract.postInit({
			ethmx: ethmx.address,
			weth: weth.address,
			accrualUpdateInterval,
		});

		const contractImpl = MockETHmxRewards__factory.connect(
			(await deployments.get('MockETHmxRewards_Implementation')).address,
			deployerSigner,
		);

		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			contractImpl,
			testerContract,
			ethmx,
			ethmxMinter,
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

	await ethmx.mockMint(await ethmx.signer.getAddress(), amountETHmx);
	await ethmx.increaseAllowance(contract.address, amountETHmx);
	await contract.stake(amountETHmx);
}
