import { expect } from 'chai';
import { deployments } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';
import { parseEther, parseUnits } from '@ethersproject/units';

import {
	MockUintLog,
	MockUintLog__factory,
} from '../../build/types/ethers-v5';
import { BigNumber } from 'ethers';
import { MaxUint256 } from '@ethersproject/constants';

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	contract: MockUintLog;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ getNamedAccounts, waffle }) => {
		const { deployer } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);

		const contract = await new MockUintLog__factory(deployerSigner).deploy();

		return {
			deployer,
			deployerSigner,
			contract,
		};
	},
);

describe('UintLog', function () {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('blog2', function () {
		describe('when x is a power of 2e18', function () {
			const tests = [
				{ arg: parseEther('1'), expected: 0 },
				{ arg: parseEther('2'), expected: parseEther('1') },
				{ arg: parseEther('4'), expected: parseEther('2') },
				{ arg: parseEther('8'), expected: parseEther('3') },
				{ arg: parseEther('16'), expected: parseEther('4') },
				{
					arg: BigNumber.from(2).pow(195).mul(BigNumber.from(10).pow(18)),
					expected: parseEther('195'),
				},
			];

			tests.forEach(({ arg, expected }) => {
				it(`takes ${arg} and returns ${expected}`, async function () {
					const { contract } = fixture;

					expect(await contract.blog2(arg)).to.eq(expected);
				});
			});
		});

		describe('when x is not a power of 2e18', function () {
			const tests = [
				{
					arg: parseEther('1.125'),
					expected: parseEther('0.169925001442312346'),
				},
				{
					arg: parseEther('2.718281828459045235'),
					expected: parseEther('1.442695040888963394'),
				},
				{
					arg: parseEther('3.141592653589793238'),
					expected: parseEther('1.651496129472318782'),
				},
				{
					arg: BigNumber.from(10).pow(36),
					expected: parseEther('59.794705707972522245'),
				},
				{
					arg: BigNumber.from(2)
						.pow(195)
						.sub(1)
						.mul(BigNumber.from(10).pow(18)),
					expected: parseEther('194.999999999999999976'),
				},
				{
					arg: parseUnits(
						'115792089237316195423570985008687907853269984665640564039457000000000000000000',
						'wei',
					),
					expected: parseEther('196.205294292027477728'),
				},
				{
					arg: MaxUint256,
					expected: parseEther('196.205294292027477728'),
				},
			];

			tests.forEach(({ arg, expected }) => {
				it(`takes ${arg} and returns ${expected}`, async function () {
					const { contract } = fixture;
					expect(await contract.blog2(arg)).to.eq(expected);
				});
			});
		});
	});

	describe('ln', async function () {
		it('should revert when x < 1e18', async function () {
			const { contract } = fixture;
			await expect(contract.ln(parseEther('0.0625'))).to.be.revertedWith(
				'blog2 too small',
			);
		});

		describe('when x is >= 1e18', async function () {
			const tests = [
				{ arg: parseEther('1'), expected: 0 },
				{
					arg: parseEther('1.125'),
					expected: parseEther('0.117783035656383442'),
				},
				{
					arg: parseEther('2'),
					expected: parseEther('0.693147180559945309'),
				},
				{
					arg: parseEther('2.718281828459045235'),
					expected: parseEther('0.999999999999999990'),
				},
				{
					arg: parseEther('3.141592653589793238'),
					expected: parseEther('1.144729885849400163'),
				},
				{
					arg: parseEther('4'),
					expected: parseEther('1.386294361119890619'),
				},
				{
					arg: parseEther('8'),
					expected: parseEther('2.079441541679835928'),
				},
				{
					arg: BigNumber.from(10).pow(36),
					expected: parseEther('41.446531673892822311'),
				},
				{
					arg: parseUnits(
						'115792089237316195423570985008687907853269984665640564039457000000000000000000',
						'wei',
					),
					expected: parseEther('135.999146549453176925'),
				},
				{
					arg: MaxUint256,
					expected: parseEther('135.999146549453176925'),
				},
			];

			tests.forEach(({ arg, expected }) => {
				it(`takes ${arg} and returns ${expected}`, async function () {
					const { contract } = fixture;
					expect(await contract.ln(arg)).to.eq(expected);
				});
			});
		});
	});
});
