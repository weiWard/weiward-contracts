import { expect } from 'chai';
import { deployments } from 'hardhat';
import { parseUnits } from 'ethers/lib/utils';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { ContractTransaction } from '@ethersproject/contracts';

import {
	MockERC20,
	MockERC20__factory,
	MockRewardsPool,
	MockRewardsPool__factory,
} from '../../build/types/ethers-v5';

const contractName = 'RewardsPool';

const rewardsDecimals = 18;
const stakingDecimals = 18;
const stakingBase = BigNumber.from(10).pow(stakingDecimals + 18);
const unsupportedDecimals = 18;
function parseRewardsToken(value: string): BigNumber {
	return parseUnits(value, rewardsDecimals);
}
function parseStakingToken(value: string): BigNumber {
	return parseUnits(value, stakingDecimals);
}
function parseUnsupportedToken(value: string): BigNumber {
	return parseUnits(value, unsupportedDecimals);
}

const initRewardsBalance = parseRewardsToken('10000');
const initStakingBalance = parseStakingToken('10000');
const initUnsupportedBalance = parseRewardsToken('10000');

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
		const unsupportedToken = await new MockERC20__factory(
			deployerSigner,
		).deploy(
			'UnsupportedToken',
			'UERC20',
			unsupportedDecimals,
			initUnsupportedBalance,
		);

		// Deploy contract
		const contract = await new MockRewardsPool__factory(deployerSigner).deploy(
			rewardsToken.address,
			stakingToken.address,
			stakingDecimals,
		);

		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			tester,
			contract,
			testerContract,
			rewardsToken,
			stakingToken,
			unsupportedToken,
		};
	},
);

describe.skip(contractName, function () {
	let deployer: string;
	let tester: string;
	let contract: MockRewardsPool;
	let testerContract: MockRewardsPool;
	let rewardsToken: MockERC20;
	let stakingToken: MockERC20;
	let unsupportedToken: MockERC20;

	const defaultStakingAmount = parseStakingToken('100');

	async function increaseAllowance(
		amount: BigNumberish = defaultStakingAmount,
	): Promise<ContractTransaction> {
		return stakingToken.increaseAllowance(contract.address, amount);
	}

	async function stake(
		amount: BigNumberish = defaultStakingAmount,
	): Promise<ContractTransaction> {
		await increaseAllowance(amount);
		return contract.stake(amount);
	}

	async function unstake(
		amount: BigNumberish = defaultStakingAmount,
	): Promise<ContractTransaction> {
		await stake(amount);
		return contract.unstake(amount);
	}

	beforeEach(async function () {
		({
			deployer,
			tester,
			contract,
			testerContract,
			rewardsToken,
			stakingToken,
			unsupportedToken,
		} = await loadFixture());
	});

	describe('constructor', function () {
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

			// Check staking balances
			expect(await contract.totalStaked(), 'totalStaked is nonzero').to.eq(0);
			expect(
				await contract.stakedBalanceOf(deployer),
				'stakedBalanceOf(deployer) is nonzero',
			).to.eq(0);
			expect(
				await contract.stakedBalanceOf(tester),
				'stakedBalanceOf(tester) is nonzero',
			).to.eq(0);

			// Check stakingTokenBase
			expect(
				await contract.stakingTokenBase(),
				'stakingTokenBase mismatch',
			).to.eq(stakingBase);
		});

		it('should revert when stakingTokenDecimals is too high', async function () {
			await expect(
				new MockRewardsPool__factory(contract.signer).deploy(
					rewardsToken.address,
					stakingToken.address,
					77 - 18,
				),
			).to.be.revertedWith('staking token has far too many decimals');
		});
	});

	describe('stake', function () {
		const amount = defaultStakingAmount;

		it('should update totalStaked', async function () {
			await stake();
			expect(await contract.totalStaked()).to.eq(amount);
		});

		it('should update stakedBalanceOf', async function () {
			await stake();
			expect(await contract.stakedBalanceOf(deployer)).to.eq(amount);
		});

		describe('should update stakingToken.balanceOf', async function () {
			it('staker', async function () {
				await stake();
				expect(await stakingToken.balanceOf(deployer)).to.eq(
					initStakingBalance.sub(amount),
				);
			});

			it('contract', async function () {
				await stake();
				expect(await stakingToken.balanceOf(contract.address)).to.eq(amount);
			});
		});

		it('should emit Staked event', async function () {
			await expect(stake())
				.to.emit(contract, 'Staked')
				.withArgs(deployer, amount);
		});

		it('should fail to stake 0', async function () {
			await expect(contract.stake(0)).to.be.revertedWith('cannot stake zero');
		});

		it('should fail to stake more than balance', async function () {
			await expect(stake(initStakingBalance.add(10))).to.be.revertedWith(
				'cannot stake more than balance',
			);
		});
	});

	describe('unstake', function () {
		const amount = defaultStakingAmount;

		it('should update totalStaked', async function () {
			await unstake();
			expect(await contract.totalStaked()).to.eq(0);
		});

		it('should update balanceOf', async function () {
			await unstake();
			expect(await contract.stakedBalanceOf(deployer)).to.eq(0);
		});

		describe('should update stakingToken.balanceOf', async function () {
			it('staker', async function () {
				await unstake();
				expect(await stakingToken.balanceOf(deployer)).to.eq(
					initStakingBalance,
				);
			});

			it('contract', async function () {
				await unstake();
				expect(await stakingToken.balanceOf(contract.address)).to.eq(0);
			});
		});

		it('should emit Unstaked event', async function () {
			await expect(unstake())
				.to.emit(contract, 'Unstaked')
				.withArgs(deployer, amount);
		});

		it('should fail to unstake 0', async function () {
			await expect(contract.unstake(0)).to.be.revertedWith(
				'cannot unstake zero',
			);
		});

		it('should fail to unstake more than staked balance', async function () {
			await expect(contract.unstake(10)).to.be.revertedWith(
				'cannot unstake more than staked balance',
			);
		});
	});

	describe('unstakeAll', function () {
		it('should unstake full balance', async function () {
			await stake();
			await contract.unstakeAll();
			expect(await contract.stakedBalanceOf(deployer)).to.eq(0);
		});
	});

	describe('pause', function () {
		it('should update paused', async function () {
			await contract.pause();
			expect(await contract.paused()).to.eq(true);
		});

		it('should pause staking', async function () {
			await contract.pause();
			await expect(stake()).to.be.revertedWith('paused');
		});

		it('can only be called by owner', async function () {
			await expect(testerContract.pause()).to.be.revertedWith(
				'caller is not the owner',
			);
		});
	});

	describe('unpause', function () {
		beforeEach(async function () {
			await contract.pause();
		});

		it('should update paused', async function () {
			await contract.unpause();
			expect(await contract.paused()).to.eq(false);
		});

		it('should unpause staking', async function () {
			await contract.unpause();
			const amount = defaultStakingAmount;
			await stake(amount);
			expect(await contract.stakedBalanceOf(deployer)).to.eq(amount);
		});

		it('can only be called by owner', async function () {
			await expect(testerContract.unpause()).to.be.revertedWith(
				'caller is not the owner',
			);
		});
	});

	describe('recoverUnstakedTokens', function () {
		describe('should recover unstaked tokens', async function () {
			it('before staking', async function () {
				const amount = parseStakingToken('100');
				await stakingToken.mint(contract.address, amount);

				expect(await contract.totalStaked(), 'totalStaked is nonzero').to.eq(
					0,
				);

				await contract.recoverUnstakedTokens(tester, amount);

				expect(
					await stakingToken.balanceOf(tester),
					'recovered tokens destination balance mismatch',
				).to.eq(amount);
			});

			it('while staking', async function () {
				const amount = parseStakingToken('100');
				await stake();

				await stakingToken.mint(contract.address, amount);

				expect(await contract.totalStaked(), 'totalStaked mismatch').to.eq(
					defaultStakingAmount,
				);

				await contract.recoverUnstakedTokens(tester, amount);

				expect(
					await stakingToken.balanceOf(tester),
					'recovered tokens destination balance mismatch',
				).to.eq(amount);
			});
		});

		describe('should fail to recover staked tokens', async function () {
			it('without unstaked tokens', async function () {
				await stake();
				await expect(
					contract.recoverUnstakedTokens(tester, 1),
				).to.be.revertedWith('cannot recover more tokens than are not staked');
			});

			it('with unstaked tokens', async function () {
				const amount = parseStakingToken('100');
				await stake();
				await stakingToken.mint(contract.address, amount);
				await expect(
					contract.recoverUnstakedTokens(tester, amount.add(1)),
				).to.be.revertedWith('cannot recover more tokens than are not staked');
			});
		});

		it('should emit RecoveredUnstaked event', async function () {
			const amount = parseStakingToken('100');
			await stakingToken.mint(contract.address, amount);
			await expect(contract.recoverUnstakedTokens(tester, amount))
				.to.emit(contract, 'RecoveredUnstaked')
				.withArgs(tester, amount);
		});

		it('can only be called by owner', async function () {
			await expect(
				testerContract.recoverUnstakedTokens(tester, 0),
			).to.be.revertedWith('caller is not the owner');
		});
	});

	describe('recoverUnsupportedERC20', function () {
		it('should fail to recover nonexistent token', async function () {
			const amount = parseUnsupportedToken('100');
			await expect(
				contract.recoverUnsupportedERC20(
					unsupportedToken.address,
					deployer,
					amount,
				),
			).to.be.revertedWith('transfer amount exceeds balance');
		});

		it('should fail to recover rewards token', async function () {
			const amount = parseRewardsToken('100');
			await rewardsToken.transfer(contract.address, amount);
			await expect(
				contract.recoverUnsupportedERC20(
					rewardsToken.address,
					deployer,
					amount,
				),
			).to.be.revertedWith('cannot recover the rewards token');
		});

		it('should fail to recover staking token', async function () {
			const amount = parseStakingToken('100');
			await stakingToken.transfer(contract.address, amount);
			await expect(
				contract.recoverUnsupportedERC20(
					stakingToken.address,
					deployer,
					amount,
				),
			).to.be.revertedWith('cannot recover the staking token');
		});

		it('should recover unsupported tokens', async function () {
			const amount = parseUnsupportedToken('100');
			await unsupportedToken.transfer(contract.address, amount);
			await contract.recoverUnsupportedERC20(
				unsupportedToken.address,
				deployer,
				amount,
			);
			expect(await unsupportedToken.balanceOf(contract.address)).to.eq(0);
			expect(await unsupportedToken.balanceOf(deployer)).to.eq(
				initUnsupportedBalance,
			);
		});

		it('should emit RecoveredUnsupported event', async function () {
			const amount = parseUnsupportedToken('100');
			await unsupportedToken.transfer(contract.address, amount);
			await expect(
				contract.recoverUnsupportedERC20(
					unsupportedToken.address,
					deployer,
					amount,
				),
			)
				.to.emit(contract, 'RecoveredUnsupported')
				.withArgs(unsupportedToken.address, deployer, amount);
		});

		it('can only be called by owner', async function () {
			const amount = parseUnsupportedToken('100');
			await unsupportedToken.transfer(contract.address, amount);
			await expect(
				testerContract.recoverUnsupportedERC20(
					unsupportedToken.address,
					tester,
					amount,
				),
			).to.be.revertedWith('caller is not the owner');
		});
	});
});
