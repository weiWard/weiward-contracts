import { expect } from 'chai';
import { BigNumber } from '@ethersproject/bignumber';

import {
	Fixture,
	loadFixture,
	uniAddLiquidity,
	uniStake,
	sushiStake,
	moonStake,
	addRewards,
	parseTokenB,
	parseRewardsToken,
} from '../common';
import { ethToEthtx, parseGwei } from '../../../helpers/conversions';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('single stake', async function () {
		let stakeAmount: BigNumber;

		beforeEach(async function () {
			const { contract, uniswapPool } = fixture;

			const amountB = parseTokenB('10');
			const amountA = ethToEthtx(parseGwei('100'), amountB);
			stakeAmount = await uniAddLiquidity(fixture, amountA, amountB);

			await uniswapPool.approve(contract.address, stakeAmount);
		});

		it('should revert when paused', async function () {
			const { contract, uniswapPool } = fixture;
			await contract.pause();
			await expect(
				contract.stake(uniswapPool.address, stakeAmount),
			).to.be.revertedWith('paused');
		});

		it('should revert with unsupported token', async function () {
			const { contract, testPool } = fixture;
			await expect(contract.stake(testPool.address, 1)).to.be.revertedWith(
				'unsupported token',
			);
		});

		it('should revert when amount is zero', async function () {
			const { contract, uniswapPool } = fixture;
			await expect(contract.stake(uniswapPool.address, 0)).to.be.revertedWith(
				'cannot stake zero',
			);
		});

		it('should revert when amount > balance', async function () {
			const { contract, uniswapPool } = fixture;
			await expect(
				contract.stake(uniswapPool.address, stakeAmount.add(1)),
			).to.be.revertedWith('ds-math-sub-underflow');
		});

		it('should transfer correct amount', async function () {
			const { contract, deployer, uniswapPool } = fixture;

			await contract.stake(uniswapPool.address, stakeAmount);

			expect(
				await uniswapPool.balanceOf(deployer),
				'deployer uni balance mismatch',
			).to.eq(0);

			expect(
				await uniswapPool.balanceOf(contract.address),
				'contract uni balance mismatch',
			).to.eq(stakeAmount);
		});

		it('should update accruedRewardsPerTokenLastFor token', async function () {
			const { contract, deployer, uniswapPool } = fixture;

			await contract.stake(uniswapPool.address, stakeAmount);

			await addRewards(fixture, parseRewardsToken('10'));
			await contract.updateAccrual();
			const arpt = await contract.accruedRewardsPerTokenFor(
				uniswapPool.address,
			);

			expect(
				await contract.accruedRewardsPerTokenLastFor(
					deployer,
					uniswapPool.address,
				),
				'mismatch before stake',
			).to.eq(0);

			const amountB = parseTokenB('10');
			const amountA = ethToEthtx(parseGwei('100'), amountB);
			await uniStake(fixture, amountA, amountB);

			expect(
				await contract.accruedRewardsPerTokenLastFor(
					deployer,
					uniswapPool.address,
				),
				'mismatch after stake',
			).to.eq(arpt);
		});

		it('should update stakedBalanceOf', async function () {
			const { contract, deployer, uniswapPool } = fixture;

			await contract.stake(uniswapPool.address, stakeAmount);

			expect(
				await contract.stakedBalanceOf(deployer, uniswapPool.address),
			).to.eq(stakeAmount);
		});

		it('should update totalStaked', async function () {
			const { contract, uniswapPool } = fixture;

			await contract.stake(uniswapPool.address, stakeAmount);

			expect(await contract.totalStaked(uniswapPool.address)).to.eq(
				stakeAmount,
			);
		});

		it('should emit Staked event', async function () {
			const { contract, deployer, uniswapPool } = fixture;

			await expect(contract.stake(uniswapPool.address, stakeAmount))
				.to.emit(contract, 'Staked')
				.withArgs(deployer, uniswapPool.address, stakeAmount);
		});
	});

	describe('multiple stakes', async function () {
		let dUniShare: BigNumber;
		let dMoonShare: BigNumber;
		let tUniShare: BigNumber;
		let tSushiShare: BigNumber;
		let totalShare: BigNumber;

		beforeEach(async function () {
			const {
				testerSigner,
				valuePerUNIV2,
				valuePerMoonV1,
				valuePerSushi,
			} = fixture;

			const amountB = parseTokenB('10');
			const amountA = ethToEthtx(parseGwei('100'), amountB);

			const dUniStaked = await uniStake(fixture, amountA, amountB);
			const dMoonStaked = await moonStake(fixture, amountA, amountB);
			const tUniStaked = await uniStake(
				fixture,
				amountA,
				amountB,
				testerSigner,
			);
			const tSushiStaked = await sushiStake(
				fixture,
				amountA,
				amountB,
				testerSigner,
			);

			const [vpUniNum, vpUniDen] = await valuePerUNIV2.valuePerToken();
			const [vpMoonNum, vpMoonDen] = await valuePerMoonV1.valuePerToken();
			const [vpSushiNum, vpSushiDen] = await valuePerSushi.valuePerToken();

			dUniShare = dUniStaked.mul(vpUniNum).div(vpUniDen);
			dMoonShare = dMoonStaked.mul(vpMoonNum).div(vpMoonDen);
			tUniShare = tUniStaked.mul(vpUniNum).div(vpUniDen);
			tSushiShare = tSushiStaked.mul(vpSushiNum).div(vpSushiDen);

			totalShare = dUniShare.add(dMoonShare).add(tUniShare).add(tSushiShare);
		});

		it('should update sharesFor', async function () {
			const {
				contract,
				deployer,
				tester,
				uniswapPool,
				mooniswapPool,
				sushiswapPool,
			} = fixture;

			expect(
				await contract.sharesFor(deployer, uniswapPool.address),
				'deployer sharesFor uni mismatch',
			).to.eq(dUniShare);

			expect(
				await contract.sharesFor(deployer, mooniswapPool.address),
				'deployer sharesFor moon mismatch',
			).to.eq(dMoonShare);

			expect(
				await contract.sharesFor(tester, uniswapPool.address),
				'tester sharesFor uni mismatch',
			).to.eq(tUniShare);

			expect(
				await contract.sharesFor(tester, sushiswapPool.address),
				'tester sharesFor sushi mismatch',
			).to.eq(tSushiShare);
		});

		it('should update totalSharesForToken', async function () {
			const { contract, uniswapPool, mooniswapPool, sushiswapPool } = fixture;

			expect(
				await contract.totalSharesForToken(uniswapPool.address),
				'totalSharesForToken uni mismatch',
			).to.eq(dUniShare.add(tUniShare));

			expect(
				await contract.totalSharesForToken(mooniswapPool.address),
				'totalSharesForToken moon mismatch',
			).to.eq(dMoonShare);

			expect(
				await contract.totalSharesForToken(sushiswapPool.address),
				'totalSharesForToken sushi mismatch',
			).to.eq(tSushiShare);
		});

		it('should update totalSharesFor', async function () {
			const { contract, deployer, tester } = fixture;

			expect(
				await contract.totalSharesFor(deployer),
				'totalSharesFor deployer mismatch',
			).to.eq(dUniShare.add(dMoonShare));

			expect(
				await contract.totalSharesFor(tester),
				'totalSharesFor tester mismatch',
			).to.eq(tUniShare.add(tSushiShare));
		});

		it('should update totalShares', async function () {
			const { contract } = fixture;

			expect(await contract.totalShares()).to.eq(totalShare);
		});
	});
}
