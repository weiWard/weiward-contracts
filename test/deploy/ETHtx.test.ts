import { expect } from 'chai';
import { deployments } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';
import { parseEther } from 'ethers/lib/utils';
import { Contract } from '@ethersproject/contracts';

import {
	ETHtxv1 as ETHtx,
	ETHtxv1__factory as ETHtx__factory,
	WETH9,
	WETH9__factory,
} from '../../build/types/ethers-v5';
import weth9Abi from '../../build/abi/WETH9.json';
import ethtxAbi from '../../build/abi/ETHtxv1.json';
import { getVersionTag } from '../../utils/deploy';

const version = getVersionTag();

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contractEthers: ETHtx;
	contractAbiEthers: ETHtx;
	wethAbiEthers: WETH9;
	wethEthers: WETH9;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ deployments, getNamedAccounts, ethers }) => {
		await deployments.fixture(version);

		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = ethers.provider.getSigner(deployer);
		const testerSigner = ethers.provider.getSigner(tester);

		const wethResult = await deployments.get('WETH9');
		const wethEthers = WETH9__factory.connect(
			wethResult.address,
			deployerSigner,
		);
		const wethAbiEthers = new Contract(
			wethResult.address,
			weth9Abi,
			deployerSigner,
		) as WETH9;

		const ethtxResult = await deployments.get('ETHtx');
		const contractEthers = ETHtx__factory.connect(
			ethtxResult.address,
			deployerSigner,
		);
		const contractAbiEthers = new Contract(
			ethtxResult.address,
			ethtxAbi,
			deployerSigner,
		) as ETHtx;

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contractEthers,
			contractAbiEthers,
			wethAbiEthers,
			wethEthers,
		};
	},
);

describe('ETHtx Deployment', function () {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('ETHtx with ethers + abi', async function () {
		it('balanceOf should succeed', async function () {
			const { contractAbiEthers, deployer } = fixture;
			expect(await contractAbiEthers.balanceOf(deployer)).to.eq(0);
		});
	});

	describe('ETHtx with ethers + typechain', async function () {
		it('balanceOf should succeed', async function () {
			const { contractEthers, deployer } = fixture;
			expect(await contractEthers.balanceOf(deployer)).to.eq(0);
		});
	});

	describe('WETH with ethers + abi', async function () {
		it('weth wrap should succeed', async function () {
			const { deployer, wethAbiEthers } = fixture;
			const amount = parseEther('10');
			await wethAbiEthers.deposit({ value: amount });
			expect(await wethAbiEthers.balanceOf(deployer)).to.eq(amount);
		});
	});

	describe('WETH with ethers + typechain', async function () {
		it('weth wrap should succeed', async function () {
			const { deployer, wethEthers } = fixture;
			const amount = parseEther('10');
			await wethEthers.deposit({ value: amount });
			expect(await wethEthers.balanceOf(deployer)).to.eq(amount);
		});
	});
});
