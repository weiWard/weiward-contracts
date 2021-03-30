import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { ContractTransaction } from '@ethersproject/contracts';
import { MaxUint256 } from '@ethersproject/constants';

import {
	MockERC20,
	MockERC20__factory,
	MockRewardsPoolInstant,
	MockRewardsPoolInstant__factory,
} from '../../build/types/ethers-v5';

const contractName = 'RewardsPoolInstant';

const rewardsDecimals = 18;
const stakingDecimals = 18;
const stakingBaseExponent = stakingDecimals + 18;
const stakingBase = BigNumber.from(10).pow(stakingBaseExponent);
function parseRewardsToken(value: string): BigNumber {
	return parseUnits(value, rewardsDecimals);
}
function parseStakingToken(value: string): BigNumber {
	return parseUnits(value, stakingDecimals);
}

const initRewardsBalance = parseRewardsToken('10000');
const initStakingBalance = parseStakingToken('100000');

// Define fixture
const loadFixture = deployments.createFixture(
	async ({ getNamedAccounts, waffle }) => {
		// Get accounts
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		// Deploy mock ERC20's
		const rewardsToken = await new MockERC20__factory(deployerSigner).deploy(
			'Rewards Token',
			'RERC20',
			rewardsDecimals,
			initRewardsBalance,
		);
		const stakingToken = await new MockERC20__factory(deployerSigner).deploy(
			'Staking Token',
			'SERC20',
			stakingDecimals,
			initStakingBalance,
		);
		stakingToken.mint(tester, initStakingBalance);

		// Deploy contract
		const contract = await new MockRewardsPoolInstant__factory(
			deployerSigner,
		).deploy(rewardsToken.address, stakingToken.address, stakingDecimals);

		const testerContract = contract.connect(testerSigner);
		const testerStakingToken = stakingToken.connect(testerSigner);

		return {
			deployer,
			tester,
			contract,
			testerContract,
			rewardsToken,
			stakingToken,
			testerStakingToken,
		};
	},
);

describe.skip(contractName, function () {
	let deployer: string;
	let tester: string;
	let contract: MockRewardsPoolInstant;
	let testerContract: MockRewardsPoolInstant;
	let rewardsToken: MockERC20;
	let stakingToken: MockERC20;
	let testerStakingToken: MockERC20;

	const defaultStakingAmount = parseStakingToken('10000');
	const defaultRewardsAmount = parseRewardsToken('50');

	async function increaseAllowance(
		amount: BigNumberish = defaultStakingAmount,
		handle: MockERC20 = stakingToken,
	): Promise<ContractTransaction> {
		return handle.increaseAllowance(contract.address, amount);
	}

	async function stakeImpl(
		amount: BigNumberish = defaultStakingAmount,
		contractHandle: MockRewardsPoolInstant = contract,
		tokenHandle: MockERC20 = stakingToken,
	): Promise<ContractTransaction> {
		await increaseAllowance(amount, tokenHandle);
		return contractHandle.stake(amount);
	}

	async function stake(
		amount: BigNumberish = defaultStakingAmount,
	): Promise<ContractTransaction> {
		return stakeImpl(amount, contract, stakingToken);
	}

	async function stakeAsTester(
		amount: BigNumberish = defaultStakingAmount,
	): Promise<ContractTransaction> {
		return stakeImpl(amount, testerContract, testerStakingToken);
	}

	async function unstake(
		amount: BigNumberish = defaultStakingAmount,
		handle: MockRewardsPoolInstant = contract,
	): Promise<ContractTransaction> {
		return handle.unstake(amount);
	}

	async function addRewards(
		amount: BigNumberish = defaultRewardsAmount,
	): Promise<ContractTransaction> {
		return rewardsToken.mint(contract.address, amount);
	}

	function expectedAccruedRewardsPerToken(
		rewards: BigNumberish = defaultRewardsAmount,
		totalStake: BigNumberish = defaultStakingAmount,
	): BigNumber {
		return BigNumber.from(rewards).mul(stakingBase).div(totalStake);
	}

	beforeEach(async function () {
		({
			deployer,
			tester,
			contract,
			testerContract,
			rewardsToken,
			stakingToken,
			testerStakingToken,
		} = await loadFixture());
	});

	it('initial state is correct', async function () {
		// Log addresses
		// console.log(`deployer: ${deployer}`);
		// console.log(`tester: ${tester}`);
		// console.log(`contract: ${contract.address}`);

		// Check tokens
		expect(
			await contract.rewardsToken(),
			'rewards token address mismatch',
		).to.eq(rewardsToken.address);
		expect(
			await contract.stakingToken(),
			'staking token address mismatch',
		).to.eq(stakingToken.address);
		expect(
			await contract.stakingTokenDecimals(),
			'staking token decimals mismatch',
		).to.eq(stakingDecimals);

		// Check token balances
		expect(
			await rewardsToken.balanceOf(deployer),
			'rewards token balance mismatch',
		).to.eq(initRewardsBalance);
		expect(
			await stakingToken.balanceOf(deployer),
			'staking token balance mismatch',
		).to.eq(initStakingBalance);

		// Check owner address
		expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);

		// Check pause state
		expect(await contract.paused(), 'paused mismatch').to.eq(false);

		// Check staking
		expect(await contract.totalStaked(), 'totalStaked is nonzero').to.eq(0);

		// Check stakingTokenBase
		expect(
			await contract.stakingTokenBase(),
			'stakingTokenBase mismatch',
		).to.eq(stakingBase);

		// Check rewards
		expect(
			await contract.accruedRewardsPerToken(),
			'accruedRewardsPerToken is nonzero',
		).to.eq(0);
		expect(
			await contract.totalRewardsAccrued(),
			'totalRewardsAccrued is nonzero',
		).to.eq(0);
		expect(
			await contract.totalRewardsRedeemed(),
			'totalRewardsRedeemed is nonzero',
		).to.eq(0);

		async function checkBalances(
			label: string,
			address: string,
		): Promise<void> {
			// Check staking balance
			expect(
				await contract.stakedBalanceOf(address),
				`stakedBalanceOf(${label}) is nonzero`,
			).to.eq(0);

			// Check rewards
			expect(
				await contract.rewardsBalanceOf(address),
				`rewardsBalanceOf(${label}) is nonzero`,
			).to.eq(0);
			expect(
				await contract.rewardsRedeemedBy(address),
				`rewardsRedeemedBy(${label}) is nonzero`,
			).to.eq(0);
		}

		await checkBalances('deployer', deployer);
		await checkBalances('tester', tester);
	});

	describe('accruedRewardsPerToken', function () {
		describe('should return zero', async function () {
			afterEach(async function () {
				expect(
					await contract.accruedRewardsPerToken(),
					'accruedRewardsPerToken is nonzero',
				).to.eq(0);
			});

			it('when totalRewardsAccrued is zero', async function () {
				expect(
					await contract.totalRewardsAccrued(),
					'totalRewardsAccrued is nonzero',
				).to.eq(0);
			});

			it('when totalRewardsAccrued is zero while staking', async function () {
				await stake();
				expect(
					await contract.totalRewardsAccrued(),
					'totalRewardsAccrued is nonzero',
				).to.eq(0);
			});

			it('with rewards when totalStaked is zero', async function () {
				await addRewards();
				expect(await contract.totalStaked(), 'totalStaked is nonzero').to.eq(
					0,
				);
			});

			it('with staking after new rewards', async function () {
				await addRewards();
				await stake();
			});
		});

		describe('should be constant', async function () {
			const expected = defaultRewardsAmount
				.mul(stakingBase)
				.div(defaultStakingAmount);

			beforeEach(async function () {
				await stake();
				await addRewards();

				expect(
					await contract.accruedRewardsPerToken(),
					'unexpected initial value for accruedRewardsPerToken',
				).to.eq(expected);
			});

			afterEach(async function () {
				expect(
					await contract.accruedRewardsPerToken(),
					'unexpected change in accruedRewardsPerToken',
				).to.eq(expected);
			});

			it('after unstaking, when totalStaked is zero', async function () {
				await unstake();
				await addRewards();
				expect(await contract.totalStaked(), 'totalStaked is nonzero').to.eq(
					0,
				);
			});
		});

		describe('should be correct', async function () {
			const original = expectedAccruedRewardsPerToken();

			beforeEach(async function () {
				await stake();
				await addRewards();
			});

			describe('when totalStaked', async function () {
				it('is constant', async function () {
					const expected = expectedAccruedRewardsPerToken();
					expect(await contract.accruedRewardsPerToken()).to.eq(expected);
				});

				it('increases', async function () {
					await stake();
					await addRewards();
					const expected = original.add(
						expectedAccruedRewardsPerToken(
							defaultRewardsAmount,
							defaultStakingAmount.mul(2),
						),
					);
					expect(await contract.accruedRewardsPerToken()).to.eq(expected);
				});

				it('decreases', async function () {
					await unstake(defaultStakingAmount.div(2));
					await addRewards();
					const expected = original.add(
						expectedAccruedRewardsPerToken(
							defaultRewardsAmount,
							defaultStakingAmount.div(2),
						),
					);
					expect(await contract.accruedRewardsPerToken()).to.eq(expected);
				});
			});

			describe('when totalRewardsAccrued', async function () {
				it('increases', async function () {
					await addRewards();
					const expected = original.mul(2);
					expect(await contract.accruedRewardsPerToken()).to.eq(expected);
				});
			});
		});

		describe('handles overflow', async function () {
			it('should succeed when rewards increase is near overflow limit', async function () {
				const amount = BigNumber.from(10).pow(77 - stakingBaseExponent);
				await stake();
				await addRewards(amount);
				const expected = expectedAccruedRewardsPerToken(amount);
				expect(await contract.accruedRewardsPerToken()).to.eq(expected);
			});

			it('should revert when rewards increase > overflow limit', async function () {
				const amount = BigNumber.from(10).pow(77);
				await stake();
				await addRewards(amount);
				await expect(contract.accruedRewardsPerToken()).to.be.revertedWith(
					'multiplication overflow',
				);
			});

			describe('should be correct when', async function () {
				it('_accruedRewardsPerToken overflows', async function () {
					// Increase to just below overflow
					await contract.setAccruedRewardsPerToken(MaxUint256);
					// Stake to emulate real-world behavior
					await stake();
					// Add rewards to cause an overflow
					await addRewards();

					const expected = expectedAccruedRewardsPerToken().sub(1);
					expect(await contract.accruedRewardsPerToken()).to.eq(expected);
				});

				it('_totalRewardsAccrued overflows', async function () {
					// Set current and last to be near overflow
					await contract.setRewardsRedeemed(MaxUint256);
					await contract.setLastTotalRewardsAccrued(MaxUint256);

					// Verify that we're near overflow
					expect(
						await contract.totalRewardsAccrued(),
						'totalRewardsAccrued mismatch before overflow',
					).to.eq(MaxUint256);

					// Stake to emulate real-world behavior
					await stake();
					// Add rewards to cause an overflow and wrap-around subtraction
					await addRewards();

					// Verify overflow
					expect(
						await contract.totalRewardsAccrued(),
						'totalRewardsAccrued mismatch after overflow',
					).to.eq(defaultRewardsAmount.sub(1));

					// Check value
					expect(
						await contract.accruedRewardsPerToken(),
						'accruedRewardsPerToken mismatch',
					).to.eq(expectedAccruedRewardsPerToken());
				});

				it('_lastTotalRewardsAccrued overflows', async function () {
					// Set last to be near overflow
					await contract.setLastTotalRewardsAccrued(MaxUint256);
					// Stake to emulate real-world behavior
					await stake();
					// Add rewards to cause wrap-around subtraction
					await addRewards();

					// Verify that current totalRewardsAccrued is near 0
					expect(
						await contract.totalRewardsAccrued(),
						'totalRewardsAccrued mismatch',
					).to.eq(defaultRewardsAmount);

					// Check value
					expect(
						await contract.accruedRewardsPerToken(),
						'accruedRewardsPerToken mismatch before overflow',
					).to.eq(expectedAccruedRewardsPerToken());

					// Update to overflow last
					await contract.updateReward();

					// Verify that lastTotalRewardsAccrued has updated
					expect(
						await contract.totalRewardsAccrued(),
						'_lastTotalRewardsAccrued mismatch',
					).to.eq(defaultRewardsAmount);

					// Add rewards to check
					await addRewards();

					// Check value
					expect(
						await contract.accruedRewardsPerToken(),
						'accruedRewardsPerToken mismatch after overflow',
					).to.eq(expectedAccruedRewardsPerToken(defaultRewardsAmount.mul(2)));
				});
			});
		});
	});

	describe('rewardsBalanceOf', function () {
		describe('should return zero', async function () {
			afterEach(async function () {
				expect(await contract.rewardsBalanceOf(deployer)).to.eq(0);
			});

			it('when not staking with rewards', async function () {
				await addRewards();
			});

			it('when staking without rewards', async function () {
				await stake();
			});

			it('when staking after rewards', async function () {
				await addRewards();
				await stake();
			});

			it('after redeeming all before new rewards', async function () {
				await stake();
				await addRewards();
				await contract.redeemAllRewards();
			});

			it('after exiting', async function () {
				await stake();
				await addRewards();
				await contract.exit();
			});
		});

		describe('should be constant', async function () {
			it('when staking without new rewards', async function () {
				await stake();
				await addRewards();
				expect(await contract.rewardsBalanceOf(deployer)).to.eq(
					defaultRewardsAmount,
				);
				await stake();
				expect(await contract.rewardsBalanceOf(deployer)).to.eq(
					defaultRewardsAmount,
				);
			});

			it('after unstaking', async function () {
				await stake();
				await addRewards();
				expect(await contract.rewardsBalanceOf(deployer)).to.eq(
					defaultRewardsAmount,
				);
				await unstake();
				await addRewards();
				expect(await contract.rewardsBalanceOf(deployer)).to.eq(
					defaultRewardsAmount,
				);
			});
		});

		describe('should be correct', async function () {
			describe('when totalRewardsAccrued increases', async function () {
				describe('and stake is', async function () {
					beforeEach(async function () {
						await stake();
						await addRewards();
					});

					it('constant', async function () {
						await addRewards();
						expect(await contract.rewardsBalanceOf(deployer)).to.eq(
							defaultRewardsAmount.mul(2),
						);
					});

					it('increased', async function () {
						await stake();
						await addRewards();
						expect(await contract.rewardsBalanceOf(deployer)).to.eq(
							defaultRewardsAmount.mul(2),
						);
					});

					it('decreased', async function () {
						await unstake(defaultStakingAmount.div(2));
						await addRewards();
						expect(await contract.rewardsBalanceOf(deployer)).to.eq(
							defaultRewardsAmount.mul(2),
						);
					});

					it('unstaked', async function () {
						await contract.unstakeAll();
						await addRewards();
						expect(await contract.rewardsBalanceOf(deployer)).to.eq(
							defaultRewardsAmount,
						);
					});
				});

				describe('and multiple parties stake is', async function () {
					describe('constant', async function () {
						function constant(a: BigNumberish, b = a): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								await stake(a);
								await stakeAsTester(b);
								await addRewards();

								const totalStake = BigNumber.from(a).add(b);
								const totalReward = defaultRewardsAmount;
								const expectedA = totalReward.mul(a).div(totalStake);
								const expectedB = totalReward.mul(b).div(totalStake);

								expect(
									await contract.rewardsBalanceOf(deployer),
									'deployer wrong rewards amount',
								).to.eq(expectedA);
								expect(
									await contract.rewardsBalanceOf(tester),
									'tester wrong rewards amount',
								).to.eq(expectedB);
							};
						}

						it('with equal amounts', constant(defaultStakingAmount));

						it(
							'with different amounts',
							constant(defaultStakingAmount, defaultStakingAmount.div(2)),
						);
					});

					describe('staggered entry', async function () {
						function staggeredEntry(a: BigNumberish, b = a): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake(aBig);
								await addRewards();

								let totalStake = aBig;
								const totalReward = defaultRewardsAmount;
								let expectedA = totalReward;

								await stakeAsTester(bBig);
								await addRewards();

								totalStake = totalStake.add(bBig);
								expectedA = expectedA.add(
									totalReward.mul(aBig).div(totalStake),
								);
								const expectedB = totalReward.mul(bBig).div(totalStake);

								expect(
									await contract.rewardsBalanceOf(deployer),
									'deployer wrong rewards amount',
								).to.eq(expectedA);
								expect(
									await contract.rewardsBalanceOf(tester),
									'tester wrong rewards amount',
								).to.eq(expectedB);
							};
						}

						it('with equal amounts', staggeredEntry(defaultStakingAmount));

						it(
							'with different amounts',
							staggeredEntry(
								defaultStakingAmount,
								defaultStakingAmount.div(2),
							),
						);
					});

					describe('increased simultaneously', async function () {
						function increase(a: BigNumberish, b = a): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake();
								await stakeAsTester();
								await addRewards();

								const totalReward = defaultRewardsAmount;
								let totalStake = defaultStakingAmount.mul(2);
								let expectedA = totalReward.div(2);
								let expectedB = expectedA;

								await stake(aBig);
								await stakeAsTester(bBig);
								await addRewards();

								totalStake = totalStake.add(aBig.add(bBig));
								expectedA = expectedA.add(
									totalReward
										.mul(defaultStakingAmount.add(aBig))
										.div(totalStake),
								);
								expectedB = expectedB.add(
									totalReward
										.mul(defaultStakingAmount.add(bBig))
										.div(totalStake),
								);

								expect(
									await contract.rewardsBalanceOf(deployer),
									'deployer wrong rewards amount',
								).to.eq(expectedA);
								expect(
									await contract.rewardsBalanceOf(tester),
									'tester wrong rewards amount',
								).to.eq(expectedB);
							};
						}

						it('with equal amounts', increase(defaultStakingAmount));

						it(
							'with different amounts',
							increase(defaultStakingAmount, defaultStakingAmount.div(2)),
						);
					});

					describe('staggered increase', async function () {
						function staggeredIncrease(
							a: BigNumberish,
							b = a,
						): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake();
								await stakeAsTester();
								await addRewards();

								const totalReward = defaultRewardsAmount;
								let aStake = defaultStakingAmount;
								let bStake = defaultStakingAmount;
								let totalStake = aStake.add(bStake);
								let expectedA = totalReward.div(2);
								let expectedB = expectedA;

								await stake(aBig);
								await addRewards();

								aStake = aStake.add(aBig);
								totalStake = totalStake.add(aBig);
								expectedA = expectedA.add(
									totalReward.mul(aStake).div(totalStake),
								);
								expectedB = expectedB.add(
									totalReward.mul(bStake).div(totalStake),
								);

								await stakeAsTester(bBig);
								await addRewards();

								bStake = bStake.add(bBig);
								totalStake = totalStake.add(bBig);
								expectedA = expectedA.add(
									totalReward.mul(aStake).div(totalStake),
								);
								expectedB = expectedB.add(
									totalReward.mul(bStake).div(totalStake),
								);

								expect(
									await contract.rewardsBalanceOf(deployer),
									'deployer wrong rewards amount',
								)
									.to.be.gte(expectedA.sub(1))
									.and.lte(expectedA.add(1));
								expect(
									await contract.rewardsBalanceOf(tester),
									'tester wrong rewards amount',
								)
									.to.be.gte(expectedB.sub(1))
									.and.lte(expectedB.add(1));
							};
						}

						it('with equal amounts', staggeredIncrease(defaultStakingAmount));

						it(
							'with different amounts',
							staggeredIncrease(
								defaultStakingAmount,
								defaultStakingAmount.div(2),
							),
						);
					});

					describe('decreased simultaneously', async function () {
						function decrease(a: BigNumberish, b = a): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake();
								await stakeAsTester();
								await addRewards();

								const totalReward = defaultRewardsAmount;
								let totalStake = defaultStakingAmount.mul(2);
								let expectedA = totalReward.div(2);
								let expectedB = expectedA;

								await unstake(aBig);
								await unstake(bBig, testerContract);
								await addRewards();

								totalStake = totalStake.sub(aBig.add(bBig));
								expectedA = expectedA.add(
									totalReward
										.mul(defaultStakingAmount.sub(aBig))
										.div(totalStake),
								);
								expectedB = expectedB.add(
									totalReward
										.mul(defaultStakingAmount.sub(bBig))
										.div(totalStake),
								);

								expect(
									await contract.rewardsBalanceOf(deployer),
									'deployer wrong rewards amount',
								).to.eq(expectedA);
								expect(
									await contract.rewardsBalanceOf(tester),
									'tester wrong rewards amount',
								).to.eq(expectedB);
							};
						}

						it('with equal amounts', decrease(defaultStakingAmount.div(2)));

						it(
							'with different amounts',
							decrease(
								defaultStakingAmount.div(2),
								defaultStakingAmount.div(4),
							),
						);
					});

					describe('staggered decrease', async function () {
						function staggeredDecrease(
							a: BigNumberish,
							b = a,
						): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake();
								await stakeAsTester();
								await addRewards();

								const totalReward = defaultRewardsAmount;
								let aStake = defaultStakingAmount;
								let bStake = defaultStakingAmount;
								let totalStake = aStake.add(bStake);
								let expectedA = totalReward.div(2);
								let expectedB = expectedA;

								await unstake(aBig);
								await addRewards();

								aStake = aStake.sub(aBig);
								totalStake = totalStake.sub(aBig);
								expectedA = expectedA.add(
									totalReward.mul(aStake).div(totalStake),
								);
								expectedB = expectedB.add(
									totalReward.mul(bStake).div(totalStake),
								);

								await unstake(bBig, testerContract);
								await addRewards();

								bStake = bStake.sub(bBig);
								totalStake = totalStake.sub(bBig);
								expectedA = expectedA.add(
									totalReward.mul(aStake).div(totalStake),
								);
								expectedB = expectedB.add(
									totalReward.mul(bStake).div(totalStake),
								);

								expect(
									await contract.rewardsBalanceOf(deployer),
									'deployer wrong rewards amount',
								).to.eq(expectedA);
								expect(
									await contract.rewardsBalanceOf(tester),
									'tester wrong rewards amount',
								).to.eq(expectedB);
							};
						}

						it(
							'with equal amounts',
							staggeredDecrease(defaultStakingAmount.div(2)),
						);

						it(
							'with different amounts',
							staggeredDecrease(
								defaultStakingAmount.div(2),
								defaultStakingAmount.div(4),
							),
						);
					});

					describe('simultaneous exit', async function () {
						function simultaneousExit(
							a: BigNumberish,
							b = a,
						): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake(aBig);
								await stakeAsTester(bBig);
								await addRewards();

								const totalReward = defaultRewardsAmount;
								const aStake = aBig;
								const bStake = bBig;
								const totalStake = aStake.add(bStake);
								const expectedA = totalReward.mul(aStake).div(totalStake);
								const expectedB = totalReward.mul(bStake).div(totalStake);

								await unstake(aBig);
								await unstake(bBig, testerContract);
								await addRewards();

								expect(
									await contract.rewardsBalanceOf(deployer),
									'deployer wrong rewards amount',
								).to.eq(expectedA);
								expect(
									await contract.rewardsBalanceOf(tester),
									'tester wrong rewards amount',
								).to.eq(expectedB);
							};
						}

						it('with equal amounts', simultaneousExit(defaultStakingAmount));

						it(
							'with different amounts',
							simultaneousExit(
								defaultStakingAmount,
								defaultStakingAmount.div(2),
							),
						);
					});

					describe('staggered exit', async function () {
						function staggeredExit(a: BigNumberish, b = a): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake(aBig);
								await stakeAsTester(bBig);
								await addRewards();

								const totalReward = defaultRewardsAmount;
								let aStake = aBig;
								const bStake = bBig;
								let totalStake = aStake.add(bStake);
								const expectedA = totalReward.mul(aStake).div(totalStake);
								let expectedB = totalReward.mul(bStake).div(totalStake);

								await unstake(aBig);
								await addRewards();

								aStake = aStake.sub(aBig);
								totalStake = totalStake.sub(aBig);
								expectedB = expectedB.add(
									totalReward.mul(bStake).div(totalStake),
								);

								await unstake(bBig, testerContract);
								await addRewards();

								expect(
									await contract.rewardsBalanceOf(deployer),
									'deployer wrong rewards amount',
								).to.eq(expectedA);
								expect(
									await contract.rewardsBalanceOf(tester),
									'tester wrong rewards amount',
								).to.eq(expectedB);
							};
						}

						it('with equal amounts', staggeredExit(defaultStakingAmount));

						it(
							'with different amounts',
							staggeredExit(defaultStakingAmount, defaultStakingAmount.div(2)),
						);
					});
				});
			});
		});

		describe('handles overflow', async function () {
			describe('should be correct when', async function () {
				it('accruedRewardsPerToken overflows', async function () {
					contract.setAccruedRewardsPerToken(MaxUint256);
					await stake();
					// Cause overflow and wrap-around subtraction
					await addRewards();

					// Verify accruedRewardsPerTokenPaid is near overflow
					expect(
						await contract.accruedRewardsPerTokenPaid(deployer),
						'accruedRewardsPerTokenPaid mismatch',
					).to.eq(MaxUint256);

					// Verify accruedRewardsPerToken has overflowed
					expect(
						await contract.accruedRewardsPerToken(),
						'accruedRewardsPerToken mismatch',
					).to.eq(expectedAccruedRewardsPerToken().sub(1));

					// Check value
					expect(await contract.rewardsBalanceOf(deployer)).to.eq(
						defaultRewardsAmount,
					);
				});

				it('accruedRewardsPerTokenPaid overflows', async function () {
					contract.setAccruedRewardsPerToken(MaxUint256);
					// Stake to also set accruedRewardsPerTokenPaid to near overflow
					await stake();
					// Cause overflow and wrap-around subtraction
					await addRewards();

					// Verify accruedRewardsPerTokenPaid is near overflow
					expect(
						await contract.accruedRewardsPerTokenPaid(deployer),
						'accruedRewardsPerTokenPaid mismatch before overflow',
					).to.eq(MaxUint256);

					// Verify accruedRewardsPerToken has overflowed
					expect(
						await contract.accruedRewardsPerToken(),
						'accruedRewardsPerToken mismatch',
					).to.eq(expectedAccruedRewardsPerToken().sub(1));

					// Check value
					expect(
						await contract.rewardsBalanceOf(deployer),
						'rewardsBalanceOf mismatch before overflow',
					).to.eq(defaultRewardsAmount);

					// Update to overflow accruedRewardsPerTokenPaid
					await contract.updateReward();

					// Verify accruedRewardsPerTokenPaid has overflowed
					expect(
						await contract.accruedRewardsPerTokenPaid(deployer),
						'accruedRewardsPerTokenPaid mismatch after overflow',
					).to.eq(expectedAccruedRewardsPerToken().sub(1));

					// Add rewards to check
					await addRewards();

					// Check value
					expect(
						await contract.rewardsBalanceOf(deployer),
						'rewardsBalanceOf mismatch after overflow',
					).to.eq(defaultRewardsAmount.mul(2));
				});
			});
		});
	});

	describe('rewardsRedeemedBy', function () {
		describe('should return zero', async function () {
			it('before any rewards are earned', async function () {
				await stake();
				expect(await contract.rewardsRedeemedBy(deployer)).to.eq(0);
			});

			it('with unredeemed rewards', async function () {
				await stake();
				await addRewards();
				expect(await contract.rewardsRedeemedBy(deployer)).to.eq(0);
			});
		});

		describe('should update after', async function () {
			beforeEach(async function () {
				await stake();
				await addRewards();
			});

			it('redeemAllRewards', async function () {
				await contract.redeemAllRewards();
				expect(await contract.rewardsRedeemedBy(deployer)).to.eq(
					defaultRewardsAmount,
				);
			});

			it('redeemReward', async function () {
				await contract.redeemReward(defaultRewardsAmount.div(2));
				expect(
					await contract.rewardsRedeemedBy(deployer),
					'mismatch after redeeming some rewards',
				).to.eq(defaultRewardsAmount.div(2));

				await contract.redeemReward(defaultRewardsAmount.div(2));
				expect(
					await contract.rewardsRedeemedBy(deployer),
					'mismatch after redeeming all rewards',
				).to.eq(defaultRewardsAmount);
			});
		});

		describe('should be correct on overflow after', async function () {
			beforeEach(async function () {
				await contract.setRewardsRedeemed(MaxUint256);
				await contract.setRewardsRedeemedBy(deployer, MaxUint256);
				await stake();
				await addRewards();
			});

			it('redeemReward', async function () {
				await contract.redeemReward(defaultRewardsAmount.div(2));
				expect(await contract.rewardsRedeemedBy(deployer)).to.eq(
					defaultRewardsAmount.div(2).sub(1),
				);
			});

			it('redeemAllRewards', async function () {
				await contract.redeemAllRewards();
				expect(await contract.rewardsRedeemedBy(deployer)).to.eq(
					defaultRewardsAmount.sub(1),
				);
			});
		});
	});

	describe('totalRewardsAccrued', function () {
		beforeEach(async function () {
			expect(
				await contract.totalRewardsAccrued(),
				'initial totalRewardsAccrued is nonzero',
			).to.eq(0);
		});

		it('should increase with contract rewards balance', async function () {
			await addRewards();
			expect(await contract.totalRewardsAccrued()).to.eq(defaultRewardsAmount);
		});

		it('should stay constant after rewards are redeemed', async function () {
			await stake();
			await addRewards();
			expect(await contract.totalRewardsAccrued()).to.eq(defaultRewardsAmount);
			await contract.redeemAllRewards();
			expect(await contract.totalRewardsAccrued()).to.eq(defaultRewardsAmount);
		});
	});

	describe('totalRewardsRedeemed', function () {
		describe('should return zero', async function () {
			it('before any rewards are earned', async function () {
				await stake();
				expect(await contract.totalRewardsRedeemed()).to.eq(0);
			});

			it('with unredeemed rewards', async function () {
				await stake();
				await addRewards();
				expect(await contract.totalRewardsRedeemed()).to.eq(0);
			});
		});

		describe('should be constant', async function () {
			it('with unredeemed rewards', async function () {
				await stake();
				await addRewards();
				await contract.redeemAllRewards();
				expect(await contract.totalRewardsRedeemed()).to.eq(
					defaultRewardsAmount,
				);
				await addRewards();
				expect(await contract.totalRewardsRedeemed()).to.eq(
					defaultRewardsAmount,
				);
			});
		});

		describe('should update after', async function () {
			beforeEach(async function () {
				await stake();
				await addRewards();
			});

			it('redeemReward', async function () {
				await contract.redeemReward(defaultRewardsAmount.div(2));
				expect(
					await contract.totalRewardsRedeemed(),
					'totalRewardsRedeemed mismatch after redeeming some rewards',
				).to.eq(defaultRewardsAmount.div(2));

				await contract.redeemReward(defaultRewardsAmount.div(2));
				expect(
					await contract.totalRewardsRedeemed(),
					'totalRewardsRedeemed mismatch after redeeming all rewards',
				).to.eq(defaultRewardsAmount);
			});

			it('redeemAllRewards', async function () {
				await contract.redeemAllRewards();
				expect(await contract.totalRewardsRedeemed()).to.eq(
					defaultRewardsAmount,
				);
			});
		});

		describe('should be correct on overflow after', async function () {
			beforeEach(async function () {
				await contract.setRewardsRedeemed(MaxUint256);
				await stake();
				await addRewards();
			});

			it('redeemReward', async function () {
				await contract.redeemReward(defaultRewardsAmount.div(2));
				expect(await contract.totalRewardsRedeemed()).to.eq(
					defaultRewardsAmount.div(2).sub(1),
				);
			});

			it('redeemAllRewards', async function () {
				await contract.redeemAllRewards();
				expect(await contract.totalRewardsRedeemed()).to.eq(
					defaultRewardsAmount.sub(1),
				);
			});
		});
	});

	describe('exit', function () {
		beforeEach(async function () {
			await stake();
			await addRewards();
			await contract.exit();
		});

		it('should unstake all', async function () {
			expect(await contract.stakedBalanceOf(deployer)).to.eq(0);
		});

		it('should redeem all rewards', async function () {
			expect(
				await contract.rewardsBalanceOf(deployer),
				'rewardsBalanceOf is nonzero',
			).to.eq(0);
			expect(
				await contract.rewardsRedeemedBy(deployer),
				'rewardsRedeemedBy mismatch',
			).to.eq(defaultRewardsAmount);
			expect(
				await rewardsToken.balanceOf(deployer),
				'rewardsToken.balanceOf mismatch',
			).to.eq(initRewardsBalance.add(defaultRewardsAmount));
		});
	});

	describe('unredeemableRewards', function () {
		describe('should return zero', async function () {
			afterEach(async function () {
				expect(await contract.unredeemableRewards()).to.eq(0);
			});

			it('before anything happens', async function () {
				await contract.updateReward();
				return;
			});

			it('when totalStaked > 0 and rewards are added', async function () {
				await stake();
				await addRewards();
				await contract.updateReward();
			});

			it('after recovering all unredeemable rewards', async function () {
				await addRewards();
				await contract.updateReward();
				await contract.recoverUnredeemableRewards(
					tester,
					defaultRewardsAmount,
				);
			});
		});

		describe('should be constant', async function () {
			it('after totalStaked > 0 and rewards are added', async function () {
				await addRewards();
				await stake();

				expect(
					await contract.unredeemableRewards(),
					'mismatch before adding redeemable rewards',
				).to.eq(defaultRewardsAmount);

				await addRewards();
				await contract.updateReward();

				expect(
					await contract.unredeemableRewards(),
					'mismatch after adding redeemable rewards',
				).to.eq(defaultRewardsAmount);
			});

			it('when totalStaked == 0 and no new rewards are added', async function () {
				await addRewards();

				await contract.updateReward();
				expect(
					await contract.unredeemableRewards(),
					'mismatch after adding unredeemable rewards',
				).to.eq(defaultRewardsAmount);

				await contract.updateReward();
				expect(
					await contract.unredeemableRewards(),
					'mismatch after second update',
				).to.eq(defaultRewardsAmount);
			});
		});

		describe('should be correct', async function () {
			it('when rewards are added before any staking', async function () {
				await addRewards();
				await contract.updateReward();
				expect(await contract.unredeemableRewards()).to.eq(
					defaultRewardsAmount,
				);
			});

			it('after some unredeemable rewards are recovered', async function () {
				await addRewards();
				await contract.updateReward();
				await contract.recoverUnredeemableRewards(
					tester,
					defaultRewardsAmount.div(2),
				);
				expect(await contract.unredeemableRewards()).to.eq(
					defaultRewardsAmount.div(2),
				);
			});

			it('after unstaking all and rewards are added', async function () {
				await stake();
				await addRewards();
				await unstake();
				await addRewards();
				await contract.updateReward();
				expect(await contract.unredeemableRewards()).to.eq(
					defaultRewardsAmount,
				);
			});

			it('after exiting all and rewards are added', async function () {
				await stake();
				await addRewards();
				await contract.exit();
				await addRewards();
				await contract.updateReward();
				expect(await contract.unredeemableRewards()).to.eq(
					defaultRewardsAmount,
				);
			});

			it('when totalRewardsAccrued overflows', async function () {
				// Set current and last to be near overflow
				await contract.setRewardsRedeemed(MaxUint256);
				await contract.setLastTotalRewardsAccrued(MaxUint256);

				// Verify that we're near overflow
				expect(
					await contract.totalRewardsAccrued(),
					'totalRewardsAccrued mismatch before overflow',
				).to.eq(MaxUint256);

				// Add rewards to cause an overflow and wrap-around subtraction
				await addRewards();
				await contract.updateReward();

				// Verify overflow
				expect(
					await contract.totalRewardsAccrued(),
					'totalRewardsAccrued mismatch after overflow',
				).to.eq(defaultRewardsAmount.sub(1));

				// Check value
				expect(
					await contract.unredeemableRewards(),
					'unredeemableRewards mismatch',
				).to.eq(defaultRewardsAmount);
			});
		});
	});

	describe('recoverUnredeemableRewards', function () {
		describe('should recover unredeemable rewards', async function () {
			beforeEach(async function () {
				await addRewards();
			});

			afterEach(async function () {
				await contract.updateReward();
				await contract.recoverUnredeemableRewards(
					tester,
					defaultRewardsAmount,
				);
				expect(await rewardsToken.balanceOf(tester)).to.eq(
					defaultRewardsAmount,
				);
			});

			it('before any staking', async function () {
				return;
			});

			it('while staking', async function () {
				await stake();
				await addRewards();
			});

			it('after unstaking all', async function () {
				await stake();
				await addRewards();
				await unstake();
			});

			it('after exiting all', async function () {
				await stake();
				await addRewards();
				await contract.exit();
			});
		});

		describe('should fail to recover redeemable rewards', async function () {
			it('without unredeemable rewards', async function () {
				await stake();
				await addRewards();

				await expect(
					contract.recoverUnredeemableRewards(tester, 1),
					'successfully recovered rewards before update',
				).to.be.revertedWith(
					'cannot recover more rewards than are unredeemable',
				);

				await contract.updateReward();

				await expect(
					contract.recoverUnredeemableRewards(tester, 1),
					'successfully recovered rewards after update',
				).to.be.revertedWith(
					'cannot recover more rewards than are unredeemable',
				);
			});

			it('with unredeemable rewards', async function () {
				await addRewards();
				await stake();
				await addRewards();

				const amount = defaultRewardsAmount.add(1);
				await expect(
					contract.recoverUnredeemableRewards(tester, amount),
					'successfully recovered rewards before update',
				).to.be.revertedWith(
					'cannot recover more rewards than are unredeemable',
				);

				await contract.updateReward();

				await expect(
					contract.recoverUnredeemableRewards(tester, amount),
					'successfully recovered rewards after update',
				).to.be.revertedWith(
					'cannot recover more rewards than are unredeemable',
				);
			});
		});

		it('should emit RecoveredUnredeemableRewards event', async function () {
			const amount = defaultRewardsAmount;
			await addRewards();
			await contract.updateReward();
			await expect(contract.recoverUnredeemableRewards(tester, amount))
				.to.emit(contract, 'RecoveredUnredeemableRewards')
				.withArgs(tester, amount);
		});

		it('can only be called by owner', async function () {
			await expect(
				testerContract.recoverUnredeemableRewards(tester, 0),
			).to.be.revertedWith('caller is not the owner');
		});
	});

	describe('redeemReward', function () {
		beforeEach(async function () {
			await stake();
			await addRewards();
		});

		it('should emit RewardPaid event', async function () {
			const amount = defaultRewardsAmount.div(2);
			await expect(contract.redeemReward(amount))
				.to.emit(contract, 'RewardPaid')
				.withArgs(deployer, amount);
		});

		it('should revert when amount > rewardsBalanceOf', async function () {
			const amount = defaultRewardsAmount.add(1);
			await expect(contract.redeemReward(amount)).to.be.revertedWith(
				'cannot redeem more rewards than you have earned',
			);
		});

		describe('should succeed when', async function () {
			function shouldSucceed(amount: BigNumber): Mocha.AsyncFunc {
				return async function (): Promise<void> {
					await contract.redeemReward(amount);

					expect(
						await contract.rewardsBalanceOf(deployer),
						'rewardsBalanceOf mismatch',
					).to.eq(defaultRewardsAmount.sub(amount));

					expect(
						await contract.rewardsRedeemedBy(deployer),
						'rewardsRedeemedBy mismatch',
					).to.eq(amount);

					expect(
						await rewardsToken.balanceOf(deployer),
						'rewardsToken.balanceOf mismatch',
					).to.eq(initRewardsBalance.add(amount));
				};
			}

			it('amount == rewardsBalanceOf', shouldSucceed(defaultRewardsAmount));

			it(
				'amount = 0.5 * rewardsBalanceOf',
				shouldSucceed(defaultRewardsAmount.div(2)),
			);

			it('amount = 1 wei', shouldSucceed(BigNumber.from(1)));
		});
	});

	describe('redeemAllRewards', function () {
		it('should emit RewardPaid event', async function () {
			await stake();
			await addRewards();
			await expect(contract.redeemAllRewards())
				.to.emit(contract, 'RewardPaid')
				.withArgs(deployer, defaultRewardsAmount);
		});

		async function redeemAllTestSetup(
			label: string,
		): Promise<{
			account: string;
			handle: MockRewardsPoolInstant;
			initBalance: BigNumber;
		}> {
			let account: string;
			let handle: MockRewardsPoolInstant;
			let initBalance: BigNumber;

			switch (label) {
				case 'deployer':
					account = deployer;
					handle = contract;
					initBalance = initRewardsBalance;
					break;
				case 'tester':
					account = tester;
					handle = testerContract;
					initBalance = BigNumber.from(0);
					break;
				default:
					throw Error('invalid label');
			}

			await handle.redeemAllRewards();

			expect(
				await handle.rewardsBalanceOf(account),
				`rewardsBalanceOf(${label}) is nonzero after redeeming all`,
			).to.eq(0);

			return { account, handle, initBalance };
		}

		async function redeemAllTest(
			amount: BigNumberish = 0,
			previous: BigNumberish = 0,
			label = 'deployer',
		): Promise<void> {
			const redeemed = BigNumber.from(previous).add(amount);
			const { account, handle, initBalance } = await redeemAllTestSetup(label);

			expect(
				await handle.rewardsRedeemedBy(account),
				`rewardsRedeemedBy(${label}) mismatch`,
			).to.eq(redeemed);

			const newBalance = initBalance.add(redeemed);
			expect(
				await rewardsToken.balanceOf(account),
				`rewardsToken.balanceOf(${label}) mismatch`,
			).to.eq(newBalance);
		}

		async function redeemAllTestFuzzy(
			amount: BigNumberish = 0,
			previous: BigNumberish = 0,
			label = 'deployer',
		): Promise<void> {
			const redeemed = BigNumber.from(previous).add(amount);

			const { account, handle, initBalance } = await redeemAllTestSetup(label);

			expect(
				await handle.rewardsRedeemedBy(account),
				`rewardsRedeemedBy(${label}) mismatch`,
			)
				.to.be.gte(redeemed.sub(1))
				.and.lte(redeemed.add(1));

			const newBalance = initBalance.add(redeemed);
			expect(
				await rewardsToken.balanceOf(account),
				`rewardsToken.balanceOf(${label}) mismatch`,
			)
				.to.be.gte(newBalance.sub(1))
				.and.lte(newBalance.add(1));
		}

		describe('should do nothing', async function () {
			it('when not staking with rewards', async function () {
				await addRewards();
				await redeemAllTest();
			});

			it('when staking without rewards', async function () {
				await stake();
				await redeemAllTest();
			});

			it('when staking after rewards', async function () {
				await addRewards();
				await stake();
				await redeemAllTest();
			});

			it('after redeeming all before new rewards', async function () {
				await stake();
				await addRewards();
				await redeemAllTest(defaultRewardsAmount);
				await redeemAllTest(defaultRewardsAmount);
			});

			it('after exiting', async function () {
				await stake();
				await addRewards();
				await contract.exit();
				await redeemAllTest(defaultRewardsAmount);
				await redeemAllTest(defaultRewardsAmount);
			});
		});

		describe('should transfer correct reward', async function () {
			describe('when totalRewardsAccrued increases', async function () {
				describe('and stake is', async function () {
					beforeEach(async function () {
						await stake();
						await addRewards();
					});

					it('constant', async function () {
						await addRewards();
						await redeemAllTest(defaultRewardsAmount.mul(2));
					});

					it('increased', async function () {
						await stake();
						await addRewards();
						await redeemAllTest(defaultRewardsAmount.mul(2));
					});

					it('decreased', async function () {
						await unstake(defaultStakingAmount.div(2));
						await addRewards();
						await redeemAllTest(defaultRewardsAmount.mul(2));
					});

					it('unstaked', async function () {
						await contract.unstakeAll();
						await addRewards();
						await redeemAllTest(defaultRewardsAmount);
					});
				});

				describe('and multiple parties stake is', async function () {
					describe('constant', async function () {
						function constant(a: BigNumberish, b = a): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								await stake(a);
								await stakeAsTester(b);
								await addRewards();

								const totalStake = BigNumber.from(a).add(b);
								const totalReward = defaultRewardsAmount;
								const expectedA = totalReward.mul(a).div(totalStake);
								const expectedB = totalReward.mul(b).div(totalStake);

								await redeemAllTest(expectedA);
								await redeemAllTest(expectedB, 0, 'tester');
							};
						}

						it('with equal amounts', constant(defaultStakingAmount));

						it(
							'with different amounts',
							constant(defaultStakingAmount, defaultStakingAmount.div(2)),
						);
					});

					describe('staggered entry', async function () {
						function staggeredEntry(a: BigNumberish, b = a): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake(aBig);
								await addRewards();

								let totalStake = aBig;
								const reward = defaultRewardsAmount;
								const expectedA1 = reward;

								await redeemAllTest(expectedA1);

								await stakeAsTester(bBig);
								await addRewards();

								totalStake = totalStake.add(bBig);
								const expectedA2 = reward.mul(aBig).div(totalStake);
								const expectedB = reward.mul(bBig).div(totalStake);

								await redeemAllTest(expectedA2, expectedA1);
								await redeemAllTest(expectedB, 0, 'tester');
							};
						}

						it('with equal amounts', staggeredEntry(defaultStakingAmount));

						it(
							'with different amounts',
							staggeredEntry(
								defaultStakingAmount,
								defaultStakingAmount.div(2),
							),
						);
					});

					describe('increased simultaneously', async function () {
						function increase(a: BigNumberish, b = a): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake();
								await stakeAsTester();
								await addRewards();

								const reward = defaultRewardsAmount;
								let totalStake = defaultStakingAmount.mul(2);
								const expectedA1 = reward.div(2);
								let expectedB = expectedA1;

								await redeemAllTest(expectedA1);

								await stake(aBig);
								await stakeAsTester(bBig);
								await addRewards();

								totalStake = totalStake.add(aBig.add(bBig));
								const expectedA2 = reward
									.mul(defaultStakingAmount.add(aBig))
									.div(totalStake);
								expectedB = expectedB.add(
									reward.mul(defaultStakingAmount.add(bBig)).div(totalStake),
								);

								await redeemAllTest(expectedA2, expectedA1);
								await redeemAllTest(expectedB, 0, 'tester');
							};
						}

						it('with equal amounts', increase(defaultStakingAmount));

						it(
							'with different amounts',
							increase(defaultStakingAmount, defaultStakingAmount.div(2)),
						);
					});

					describe('staggered increase', async function () {
						function staggeredIncrease(
							a: BigNumberish,
							b = a,
						): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake();
								await stakeAsTester();
								await addRewards();

								const reward = defaultRewardsAmount;
								let aStake = defaultStakingAmount;
								let bStake = defaultStakingAmount;
								let totalStake = aStake.add(bStake);
								const expectedA1 = reward.div(2);
								let expectedB1 = expectedA1;

								await redeemAllTest(expectedA1);

								await stake(aBig);
								await addRewards();

								aStake = aStake.add(aBig);
								totalStake = totalStake.add(aBig);
								let expectedA2 = reward.mul(aStake).div(totalStake);
								expectedB1 = expectedB1.add(
									reward.mul(bStake).div(totalStake),
								);

								await redeemAllTest(expectedB1, 0, 'tester');

								await stakeAsTester(bBig);
								await addRewards();

								bStake = bStake.add(bBig);
								totalStake = totalStake.add(bBig);
								expectedA2 = expectedA2.add(
									reward.mul(aStake).div(totalStake),
								);
								const expectedB2 = reward.mul(bStake).div(totalStake);

								await redeemAllTestFuzzy(expectedA2, expectedA1);
								await redeemAllTestFuzzy(expectedB2, expectedB1, 'tester');
							};
						}

						it('with equal amounts', staggeredIncrease(defaultStakingAmount));

						it(
							'with different amounts',
							staggeredIncrease(
								defaultStakingAmount,
								defaultStakingAmount.div(2),
							),
						);
					});

					describe('decreased simultaneously', async function () {
						function decrease(a: BigNumberish, b = a): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake();
								await stakeAsTester();
								await addRewards();

								const reward = defaultRewardsAmount;
								let totalStake = defaultStakingAmount.mul(2);
								let expectedA = reward.div(2);
								let expectedB = expectedA;

								await unstake(aBig);
								await unstake(bBig, testerContract);
								await addRewards();

								totalStake = totalStake.sub(aBig.add(bBig));
								expectedA = expectedA.add(
									reward.mul(defaultStakingAmount.sub(aBig)).div(totalStake),
								);
								expectedB = expectedB.add(
									reward.mul(defaultStakingAmount.sub(bBig)).div(totalStake),
								);

								await redeemAllTest(expectedA);
								await redeemAllTest(expectedB, 0, 'tester');
							};
						}

						it('with equal amounts', decrease(defaultStakingAmount.div(2)));

						it(
							'with different amounts',
							decrease(
								defaultStakingAmount.div(2),
								defaultStakingAmount.div(4),
							),
						);
					});

					describe('staggered decrease', async function () {
						function staggeredDecrease(
							a: BigNumberish,
							b = a,
						): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake();
								await stakeAsTester();
								await addRewards();

								const reward = defaultRewardsAmount;
								let aStake = defaultStakingAmount;
								let bStake = defaultStakingAmount;
								let totalStake = aStake.add(bStake);
								const expectedA1 = reward.div(2);
								let expectedB1 = expectedA1;

								await redeemAllTest(expectedA1);

								await unstake(aBig);
								await addRewards();

								aStake = aStake.sub(aBig);
								totalStake = totalStake.sub(aBig);
								let expectedA2 = reward.mul(aStake).div(totalStake);
								expectedB1 = expectedB1.add(
									reward.mul(bStake).div(totalStake),
								);

								await redeemAllTest(expectedB1, 0, 'tester');

								await unstake(bBig, testerContract);
								await addRewards();

								bStake = bStake.sub(bBig);
								totalStake = totalStake.sub(bBig);
								expectedA2 = expectedA2.add(
									reward.mul(aStake).div(totalStake),
								);
								const expectedB2 = reward.mul(bStake).div(totalStake);

								await redeemAllTest(expectedA2, expectedA1);
								await redeemAllTest(expectedB2, expectedB1, 'tester');
							};
						}

						it(
							'with equal amounts',
							staggeredDecrease(defaultStakingAmount.div(2)),
						);

						it(
							'with different amounts',
							staggeredDecrease(
								defaultStakingAmount.div(2),
								defaultStakingAmount.div(4),
							),
						);
					});

					describe('simultaneous exit', async function () {
						function simultaneousExit(
							a: BigNumberish,
							b = a,
						): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake(aBig);
								await stakeAsTester(bBig);
								await addRewards();

								const totalReward = defaultRewardsAmount;
								const aStake = aBig;
								const bStake = bBig;
								const totalStake = aStake.add(bStake);
								const expectedA = totalReward.mul(aStake).div(totalStake);
								const expectedB = totalReward.mul(bStake).div(totalStake);

								await unstake(aBig);
								await unstake(bBig, testerContract);
								await addRewards();

								await redeemAllTest(expectedA);
								await redeemAllTest(expectedB, 0, 'tester');
							};
						}

						it('with equal amounts', simultaneousExit(defaultStakingAmount));

						it(
							'with different amounts',
							simultaneousExit(
								defaultStakingAmount,
								defaultStakingAmount.div(2),
							),
						);
					});

					describe('staggered unstakeAll', async function () {
						function staggeredExit(a: BigNumberish, b = a): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake(aBig);
								await stakeAsTester(bBig);
								await addRewards();

								const totalReward = defaultRewardsAmount;
								let aStake = aBig;
								const bStake = bBig;
								let totalStake = aStake.add(bStake);
								const expectedA = totalReward.mul(aStake).div(totalStake);
								let expectedB = totalReward.mul(bStake).div(totalStake);

								await unstake(aBig);
								await addRewards();

								aStake = aStake.sub(aBig);
								totalStake = totalStake.sub(aBig);
								expectedB = expectedB.add(
									totalReward.mul(bStake).div(totalStake),
								);

								await unstake(bBig, testerContract);
								await addRewards();

								await redeemAllTest(expectedA);
								await redeemAllTest(expectedB, 0, 'tester');
							};
						}

						it('with equal amounts', staggeredExit(defaultStakingAmount));

						it(
							'with different amounts',
							staggeredExit(defaultStakingAmount, defaultStakingAmount.div(2)),
						);
					});

					describe('staggered exit', async function () {
						function staggeredExit(a: BigNumberish, b = a): Mocha.AsyncFunc {
							return async function (): Promise<void> {
								const aBig = BigNumber.from(a);
								const bBig = BigNumber.from(b);

								await stake(aBig);
								await stakeAsTester(bBig);
								await addRewards();

								const totalReward = defaultRewardsAmount;
								let aStake = aBig;
								const bStake = bBig;
								let totalStake = aStake.add(bStake);
								const expectedA = totalReward.mul(aStake).div(totalStake);
								let expectedB = totalReward.mul(bStake).div(totalStake);

								await unstake(aBig);
								await addRewards();

								expect(
									await contract.totalRewardsAccrued(),
									'totalRewardsAccrued mismatch',
								).to.eq(totalReward.mul(2));

								await redeemAllTest(expectedA);

								aStake = aStake.sub(aBig);
								totalStake = totalStake.sub(aBig);
								expectedB = expectedB.add(
									totalReward.mul(bStake).div(totalStake),
								);

								await unstake(bBig, testerContract);
								await addRewards();

								await redeemAllTest(expectedB, 0, 'tester');

								// Check that no more rewards can be taken
								await redeemAllTest(0, expectedA);
								await redeemAllTest(0, expectedB, 'tester');
							};
						}

						it('with equal amounts', staggeredExit(defaultStakingAmount));

						it(
							'with different amounts',
							staggeredExit(defaultStakingAmount, defaultStakingAmount.div(2)),
						);
					});
				});
			});
		});
	});
});
