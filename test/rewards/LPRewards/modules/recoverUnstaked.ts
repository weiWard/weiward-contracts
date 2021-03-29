import { expect } from 'chai';

import {
	Fixture,
	loadFixture,
	parseTokenA,
	parseTokenB,
	uniAddLiquidity,
	uniStake,
} from '../common';
import { ethToEthtx, parseGwei } from '../../../helpers/conversions';

export default function run(): void {
	let fixture: Fixture;
	const amountB = parseTokenB('10');
	const amountA = ethToEthtx(parseGwei('100'), amountB);

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	it('can only be called by owner', async function () {
		const { testerContract, tester, tokenA } = fixture;

		await expect(
			testerContract.recoverUnstaked(tokenA.address, tester, 1),
		).to.be.revertedWith('caller is not the owner');
	});

	it('should revert with rewardsToken', async function () {
		const { contract, deployer, rewardsToken } = fixture;

		await expect(
			contract.recoverUnstaked(rewardsToken.address, deployer, 1),
		).to.be.revertedWith('cannot recover rewardsToken');
	});

	it('should recover unsupported tokens', async function () {
		const { contract, tester, tokenA } = fixture;
		const amount = parseTokenA('100');
		await tokenA.mint(contract.address, amount);

		expect(
			await tokenA.balanceOf(contract.address),
			'contract balanceOf mismatch before recovery',
		).to.eq(amount);

		expect(
			await tokenA.balanceOf(tester),
			'target balanceOf mismatch before recovery',
		).to.eq(0);

		await contract.recoverUnstaked(tokenA.address, tester, amount);

		expect(
			await tokenA.balanceOf(contract.address),
			'contract balanceOf mismatch after recovery',
		).to.eq(0);

		expect(
			await tokenA.balanceOf(tester),
			'target balanceOf mismatch after recovery',
		).to.eq(amount);
	});

	it('should recover unstaked tokens', async function () {
		const { contract, tester, uniswapPool } = fixture;

		const staked = await uniStake(fixture, amountA, amountB);
		const unstaked = await uniAddLiquidity(fixture, amountA, amountB);
		await uniswapPool.transfer(contract.address, unstaked);

		expect(
			await uniswapPool.balanceOf(contract.address),
			'contract LP balance mismatch before recovery',
		).to.eq(staked.add(unstaked));

		expect(
			await contract.totalStaked(uniswapPool.address),
			'contract totalStaked mismatch before recovery',
		).to.eq(staked);

		expect(
			await uniswapPool.balanceOf(tester),
			'target LP balance mismatch before recovery',
		).to.eq(0);

		await contract.recoverUnstaked(uniswapPool.address, tester, unstaked);

		expect(
			await uniswapPool.balanceOf(contract.address),
			'contract LP balance mismatch after recovery',
		).to.eq(staked);

		expect(
			await contract.totalStaked(uniswapPool.address),
			'contract totalStaked mismatch after recovery',
		).to.eq(staked);

		expect(
			await uniswapPool.balanceOf(tester),
			'target LP balance mismatch after recovery',
		).to.eq(unstaked);
	});

	it('should recover previously supported and unstaked tokens', async function () {
		const { contract, tester, uniswapPool } = fixture;

		const staked = await uniStake(fixture, amountA, amountB);
		const unstaked = await uniAddLiquidity(fixture, amountA, amountB);
		await uniswapPool.transfer(contract.address, unstaked);

		await contract.removeToken(uniswapPool.address);

		expect(
			await uniswapPool.balanceOf(contract.address),
			'contract LP balance mismatch before recovery',
		).to.eq(staked.add(unstaked));

		expect(
			await contract.totalStaked(uniswapPool.address),
			'contract totalStaked mismatch before recovery',
		).to.eq(staked);

		expect(
			await uniswapPool.balanceOf(tester),
			'target LP balance mismatch before recovery',
		).to.eq(0);

		await contract.recoverUnstaked(uniswapPool.address, tester, unstaked);

		expect(
			await uniswapPool.balanceOf(contract.address),
			'contract LP balance mismatch after recovery',
		).to.eq(staked);

		expect(
			await contract.totalStaked(uniswapPool.address),
			'contract totalStaked mismatch after recovery',
		).to.eq(staked);

		expect(
			await uniswapPool.balanceOf(tester),
			'target LP balance mismatch after recovery',
		).to.eq(unstaked);
	});

	it('should revert when amount > unstaked for supported token', async function () {
		const { contract, tester, uniswapPool } = fixture;

		await uniStake(fixture, amountA, amountB);
		const unstaked = await uniAddLiquidity(fixture, amountA, amountB);
		await uniswapPool.transfer(contract.address, unstaked);

		await expect(
			contract.recoverUnstaked(uniswapPool.address, tester, unstaked.add(1)),
		).to.be.revertedWith('recovery amount > unstaked');
	});

	it('should revert when amount > unstaked for previously supported token', async function () {
		const { contract, tester, uniswapPool } = fixture;

		await uniStake(fixture, amountA, amountB);
		const unstaked = await uniAddLiquidity(fixture, amountA, amountB);
		await uniswapPool.transfer(contract.address, unstaked);

		await contract.removeToken(uniswapPool.address);

		await expect(
			contract.recoverUnstaked(uniswapPool.address, tester, unstaked.add(1)),
		).to.be.revertedWith('recovery amount > unstaked');
	});

	it('should revert when amount > balanceOf for unsupported token', async function () {
		const { contract, tester, tokenA } = fixture;
		const amount = parseTokenA('100');
		await tokenA.mint(contract.address, amount);

		await expect(
			contract.recoverUnstaked(tokenA.address, tester, amount.add(1)),
		).to.be.revertedWith('recovery amount > unstaked');
	});

	it('should emit RecoveredUnstaked event', async function () {
		const { contract, deployer, tester, tokenA } = fixture;
		const amount = parseTokenA('100');
		await tokenA.mint(contract.address, amount);

		await expect(contract.recoverUnstaked(tokenA.address, tester, amount))
			.to.emit(contract, 'RecoveredUnstaked')
			.withArgs(deployer, tokenA.address, tester, amount);
	});
}
