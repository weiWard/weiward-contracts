import { expect } from 'chai';
import { deployments } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';
import { parseEther, parseUnits } from '@ethersproject/units';
import { BigNumber } from '@ethersproject/bignumber';
import { MaxUint256 } from '@ethersproject/constants';

import {
	MockERC20,
	MockERC20__factory,
	MockRewardsManager,
	MockRewardsManager__factory,
} from '../../build/types/ethers-v5';
import { zeroAddress, zeroPadAddress } from '../helpers/address';

const contractName = 'RewardsManager';

const rewardsDecimals = 18;
function parseRewardsToken(value: string): BigNumber {
	return parseUnits(value, rewardsDecimals);
}
const defaultRecipient = zeroPadAddress('0x1');

interface Fixture {
	deployer: string;
	deployerSigner: JsonRpcSigner;
	tester: string;
	testerSigner: JsonRpcSigner;
	contract: MockRewardsManager;
	testerContract: MockRewardsManager;
	rewardsToken: MockERC20;
}

const loadFixture = deployments.createFixture<Fixture, unknown>(
	async ({ getNamedAccounts, waffle }) => {
		const { deployer, tester } = await getNamedAccounts();
		const deployerSigner = waffle.provider.getSigner(deployer);
		const testerSigner = waffle.provider.getSigner(tester);

		const rewardsToken = await new MockERC20__factory(deployerSigner).deploy(
			'Rewards Token',
			'RERC20',
			rewardsDecimals,
			0,
		);

		const contract = await new MockRewardsManager__factory(
			deployerSigner,
		).deploy(defaultRecipient, rewardsToken.address);
		const testerContract = contract.connect(testerSigner);

		return {
			deployer,
			deployerSigner,
			tester,
			testerSigner,
			contract,
			testerContract,
			rewardsToken,
		};
	},
);

describe(contractName, function () {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('constructor', function () {
		it('initial state is correct', async function () {
			const { contract, deployer, tester, rewardsToken } = fixture;

			expect(await contract.owner(), 'owner address mismatch').to.eq(deployer);

			expect(
				await contract.defaultRecipient(),
				'default recipient mismatch',
			).to.eq(defaultRecipient);

			const [dSharesActive, dSharesTotal] = await contract.sharesFor(deployer);
			expect(dSharesActive, 'sharesFor deployer active mismatch').to.eq(0);
			expect(dSharesTotal, 'sharesFor deployer total mismatch').to.eq(0);

			const [tSharesActive, tSharesTotal] = await contract.sharesFor(tester);
			expect(tSharesActive, 'sharesFor tester active mismatch').to.eq(0);
			expect(tSharesTotal, 'sharesFor tester total mismatch').to.eq(0);

			expect(
				await contract.totalRewardsRedeemed(),
				'totalRewardsRedeemed mismatch',
			).to.eq(0);

			expect(await contract.totalShares(), 'totalShares mismatch').to.eq(0);

			expect(
				await contract.rewardsToken(),
				'rewardsToken address mismatch',
			).to.eq(rewardsToken.address);
		});
	});

	describe('activateShares', function () {
		it('should do nothing for account without shares', async function () {
			const { contract } = fixture;
			await expect(contract.activateShares()).to.not.emit(
				contract,
				'SharesActivated',
			);
		});

		it('should do nothing for active recipient', async function () {
			const { contract, deployer } = fixture;

			await contract.setShares(deployer, 10, true);

			await expect(contract.activateShares()).to.not.emit(
				contract,
				'SharesActivated',
			);
		});

		it('should activate all deactivated shares', async function () {
			const { contract, deployer } = fixture;
			const shares = 10;

			await contract.setShares(deployer, shares, false);
			await contract.activateShares();

			const [active, total] = await contract.sharesFor(deployer);

			expect(active, 'active shares mismatch').to.eq(shares);
			expect(total, 'total shares mismatch').to.eq(shares);
		});

		it('should deallocate active shares from the default recipient', async function () {
			const { contract, deployer } = fixture;
			const shares = 10;

			await contract.setShares(deployer, shares, false);
			await contract.activateShares();

			const [active, total] = await contract.sharesFor(defaultRecipient);

			expect(active, 'active shares mismatch').to.eq(0);
			expect(total, 'total shares mismatch').to.eq(0);
		});

		it('should emit SharesActivated event', async function () {
			const { contract, deployer } = fixture;
			const shares = 10;

			await contract.setShares(deployer, shares, false);

			await expect(contract.activateShares())
				.to.emit(contract, 'SharesActivated')
				.withArgs(deployer, deployer);
		});
	});

	describe('activateSharesFor', function () {
		it('can only be called by owner', async function () {
			const { testerContract, tester } = fixture;

			await expect(
				testerContract.activateSharesFor(tester),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should do nothing for account without shares', async function () {
			const { contract, tester } = fixture;
			await expect(contract.activateSharesFor(tester)).to.not.emit(
				contract,
				'SharesActivated',
			);
		});

		it('should do nothing for active recipient', async function () {
			const { contract, tester } = fixture;

			await contract.setShares(tester, 10, true);

			await expect(contract.activateSharesFor(tester)).to.not.emit(
				contract,
				'SharesActivated',
			);
		});

		it('should activate all deactivated shares', async function () {
			const { contract, tester } = fixture;
			const shares = 10;

			await contract.setShares(tester, shares, false);
			await contract.activateSharesFor(tester);

			const [active, total] = await contract.sharesFor(tester);

			expect(active, 'active shares mismatch').to.eq(shares);
			expect(total, 'total shares mismatch').to.eq(shares);
		});

		it('should deallocate active shares from the default recipient', async function () {
			const { contract, tester } = fixture;
			const shares = 10;

			await contract.setShares(tester, shares, false);
			await contract.activateSharesFor(tester);

			const [active, total] = await contract.sharesFor(defaultRecipient);

			expect(active, 'active shares mismatch').to.eq(0);
			expect(total, 'total shares mismatch').to.eq(0);
		});

		it('should emit SharesActivated event', async function () {
			const { contract, deployer, tester } = fixture;
			const shares = 10;

			await contract.setShares(tester, shares, false);

			await expect(contract.activateSharesFor(tester))
				.to.emit(contract, 'SharesActivated')
				.withArgs(deployer, tester);
		});
	});

	describe('addShares', function () {
		it('can only be called by owner', async function () {
			const { testerContract, tester } = fixture;

			await expect(testerContract.addShares(tester, 10)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should revert on zero address', async function () {
			const { contract } = fixture;

			await expect(contract.addShares(zeroAddress, 10)).to.be.revertedWith(
				'cannot add shares to zero address',
			);
		});

		it('should revert on the contract address', async function () {
			const { contract } = fixture;

			await expect(
				contract.addShares(contract.address, 10),
			).to.be.revertedWith('cannot add shares to this contract address');
		});

		it('should revert on zero amount', async function () {
			const { contract, tester } = fixture;

			await expect(contract.addShares(tester, 0)).to.be.revertedWith(
				'cannot add zero shares',
			);
		});

		it('should add deactivated shares for new recipient', async function () {
			const { contract, tester } = fixture;
			const shares = 10;

			await contract.addShares(tester, shares);

			let [active, total] = await contract.sharesFor(tester);
			expect(active, 'active shares mismatch').to.eq(0);
			expect(total, 'total shares mismatch').to.eq(shares);

			[active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'defaultRecipient active shares mismatch').to.eq(shares);
			expect(total, 'defaultRecipient total shares mismatch').to.eq(0);
		});

		it('should add activated shares for existing recipient', async function () {
			const { contract, tester } = fixture;
			const initShares = 20;
			const shares = 10;
			const totalShares = initShares + shares;

			await contract.setShares(tester, initShares, true);
			await contract.addShares(tester, shares);

			let [active, total] = await contract.sharesFor(tester);
			expect(active, 'active shares mismatch').to.eq(totalShares);
			expect(total, 'total shares mismatch').to.eq(totalShares);

			[active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'defaultRecipient active shares mismatch').to.eq(0);
			expect(total, 'defaultRecipient total shares mismatch').to.eq(0);
		});

		it('should add deactivated shares for existing deactivated recipient', async function () {
			const { contract, tester } = fixture;
			const initShares = 20;
			const shares = 10;
			const totalShares = initShares + shares;

			await contract.setShares(tester, initShares, false);
			await contract.addShares(tester, shares);

			let [active, total] = await contract.sharesFor(tester);
			expect(active, 'target active shares mismatch').to.eq(0);
			expect(total, 'target total shares mismatch').to.eq(totalShares);

			[active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'defaultRecipient active shares mismatch').to.eq(
				totalShares,
			);
			expect(total, 'defaultRecipient total shares mismatch').to.eq(0);
		});

		it('should update totalShares', async function () {
			const { contract, tester } = fixture;
			const shares = 10;

			await contract.addShares(tester, shares);
			expect(await contract.totalShares()).to.eq(shares);
		});

		it('should emit SharesAdded event', async function () {
			const { contract, deployer, tester } = fixture;
			const shares = 10;

			await expect(contract.addShares(tester, shares))
				.to.emit(contract, 'SharesAdded')
				.withArgs(deployer, tester, shares);
		});
	});

	describe('deactivateShares', function () {
		it('should do nothing for account without shares', async function () {
			const { contract } = fixture;

			await expect(contract.deactivateShares()).to.not.emit(
				contract,
				'SharesDeactivated',
			);
		});

		it('should do nothing for deactivated recipient', async function () {
			const { contract, deployer } = fixture;

			await contract.setShares(deployer, 10, false);

			await expect(contract.deactivateShares()).to.not.emit(
				contract,
				'SharesDeactivated',
			);
		});

		it('should deactivate all active shares', async function () {
			const { contract, deployer } = fixture;
			const shares = 10;

			await contract.setShares(deployer, shares, true);
			await contract.deactivateShares();

			const [active, total] = await contract.sharesFor(deployer);
			expect(active, 'active shares mismatch').to.eq(0);
			expect(total, 'total shares mismatch').to.eq(shares);
		});

		it('should allocate active shares to the default recipient', async function () {
			const { contract, deployer } = fixture;
			const shares = 10;

			await contract.setShares(deployer, shares, true);
			await contract.deactivateShares();

			const [active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'active shares mismatch').to.eq(shares);
			expect(total, 'total shares mismatch').to.eq(0);
		});

		it('should emit SharesDeactivated event', async function () {
			const { contract, deployer } = fixture;
			const shares = 10;

			await contract.setShares(deployer, shares, true);

			await expect(contract.deactivateShares())
				.to.emit(contract, 'SharesDeactivated')
				.withArgs(deployer, deployer);
		});
	});

	describe('deactivateSharesFor', function () {
		it('can only be called by owner', async function () {
			const { testerContract, tester } = fixture;

			await expect(
				testerContract.deactivateSharesFor(tester),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should do nothing for default recipient', async function () {
			const { contract, tester } = fixture;

			await contract.setShares(tester, 10, false);

			await expect(contract.deactivateSharesFor(defaultRecipient)).to.not.emit(
				contract,
				'SharesDeactivated',
			);
		});

		it('should do nothing for account without shares', async function () {
			const { contract, tester } = fixture;

			await expect(contract.deactivateSharesFor(tester)).to.not.emit(
				contract,
				'SharesDeactivated',
			);
		});

		it('should do nothing for deactivated recipient', async function () {
			const { contract, tester } = fixture;

			await contract.setShares(tester, 10, false);

			await expect(contract.deactivateSharesFor(tester)).to.not.emit(
				contract,
				'SharesDeactivated',
			);
		});

		it('should deactivate all active shares', async function () {
			const { contract, tester } = fixture;
			const shares = 10;

			await contract.setShares(tester, shares, true);
			await contract.deactivateSharesFor(tester);

			const [active, total] = await contract.sharesFor(tester);
			expect(active, 'active shares mismatch').to.eq(0);
			expect(total, 'total shares mismatch').to.eq(shares);
		});

		it('should allocate active shares to the default recipient', async function () {
			const { contract, tester } = fixture;
			const shares = 10;

			await contract.setShares(tester, shares, true);
			await contract.deactivateSharesFor(tester);

			const [active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'active shares mismatch').to.eq(shares);
			expect(total, 'total shares mismatch').to.eq(0);
		});

		it('should emit SharesDeactivated event', async function () {
			const { contract, deployer, tester } = fixture;
			const shares = 10;

			await contract.setShares(tester, shares, true);

			await expect(contract.deactivateSharesFor(tester))
				.to.emit(contract, 'SharesDeactivated')
				.withArgs(deployer, tester);
		});
	});

	describe('recoverUnsupportedERC20', function () {
		let testToken: MockERC20;

		beforeEach(async function () {
			const { deployerSigner } = fixture;

			testToken = await new MockERC20__factory(deployerSigner).deploy(
				'Test Token',
				'TEST',
				18,
				0,
			);
		});

		it('can only be called by owner', async function () {
			const { testerContract, tester } = fixture;

			await expect(
				testerContract.recoverUnsupportedERC20(testToken.address, tester, 1),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should revert on rewards token', async function () {
			const { contract, tester, rewardsToken } = fixture;

			await expect(
				contract.recoverUnsupportedERC20(rewardsToken.address, tester, 1),
			).to.be.revertedWith('cannot recover rewards token');
		});

		it('should fail to recover nonexistent token', async function () {
			const { contract, tester } = fixture;
			await expect(
				contract.recoverUnsupportedERC20(testToken.address, tester, 1),
			).to.be.revertedWith('transfer amount exceeds balance');
		});

		it('should transfer amount', async function () {
			const { contract, tester } = fixture;
			const amount = parseEther('10');

			await testToken.mint(contract.address, amount);
			await contract.recoverUnsupportedERC20(
				testToken.address,
				tester,
				amount,
			);

			expect(
				await testToken.balanceOf(contract.address),
				'contract balance mismatch',
			).to.eq(0);
			expect(
				await testToken.balanceOf(tester),
				'target balance mismatch',
			).to.eq(amount);
		});

		it('should emit RecoveredUnsupported event', async function () {
			const { contract, deployer, tester } = fixture;
			const amount = parseEther('10');

			await testToken.mint(contract.address, amount);

			await expect(
				contract.recoverUnsupportedERC20(testToken.address, tester, amount),
			)
				.to.emit(contract, 'RecoveredUnsupported')
				.withArgs(deployer, testToken.address, tester, amount);
		});
	});

	describe('removeShares', function () {
		it('can only be called by owner', async function () {
			const { testerContract, tester } = fixture;

			await expect(testerContract.removeShares(tester, 1)).to.be.revertedWith(
				'caller is not the owner',
			);
		});

		it('should revert when amount is zero', async function () {
			const { contract, tester } = fixture;

			await expect(contract.removeShares(tester, 0)).to.be.revertedWith(
				'cannot remove zero shares',
			);
		});

		it('should revert when amount > shares', async function () {
			const { contract, deployer, tester } = fixture;

			await contract.setShares(deployer, 10, false);

			await expect(contract.removeShares(tester, 1)).to.be.revertedWith(
				'subtraction overflow',
			);
		});

		it('should reduce sharesFor by amount', async function () {
			const { contract, tester } = fixture;
			const shares = 10;
			const removed = 7;
			const result = shares - removed;

			await contract.setShares(tester, shares, true);
			await contract.removeShares(tester, removed);

			const [active, total] = await contract.sharesFor(tester);
			expect(active, 'active shares mismatch').to.eq(result);
			expect(total, 'total shares mismatch').to.eq(result);
		});

		it('should reduce deactivated shares for deactivated recipient', async function () {
			const { contract, tester } = fixture;
			const shares = 10;
			const removed = 7;
			const result = shares - removed;

			await contract.setShares(tester, shares, false);
			await contract.removeShares(tester, removed);

			let [active, total] = await contract.sharesFor(tester);
			expect(active, 'target active shares mismatch').to.eq(0);
			expect(total, 'target total shares mismatch').to.eq(result);

			[active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'defaultRecipient active shares mismatch').to.eq(result);
			expect(total, 'defaultRecipient total shares mismatch').to.eq(0);
		});

		it('should update totalShares', async function () {
			const { contract, tester } = fixture;
			const shares = 10;
			const removed = 7;
			const result = shares - removed;

			await contract.addShares(tester, shares);
			await contract.removeShares(tester, removed);

			expect(await contract.totalShares()).to.eq(result);
		});

		it('should emit SharesRemoved event', async function () {
			const { contract, deployer, tester } = fixture;
			const shares = 10;
			const removed = 7;

			await contract.addShares(tester, shares);
			await expect(contract.removeShares(tester, removed))
				.to.emit(contract, 'SharesRemoved')
				.withArgs(deployer, tester, removed);
		});
	});

	describe('setDefaultRecipient', function () {
		it('can only be called by owner', async function () {
			const { testerContract, tester } = fixture;

			await expect(
				testerContract.setDefaultRecipient(tester),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should revert on zero address', async function () {
			const { contract } = fixture;

			await expect(
				contract.setDefaultRecipient(zeroAddress),
			).to.be.revertedWith('cannot set to zero address');
		});

		it('should revert on contract address', async function () {
			const { contract } = fixture;

			await expect(
				contract.setDefaultRecipient(contract.address),
			).to.be.revertedWith('cannot set to this contract');
		});

		it('should activate shares for existing deactivated account', async function () {
			const { contract, deployer, tester } = fixture;

			await contract.setShares(tester, 10, false);

			await expect(contract.setDefaultRecipient(tester))
				.to.emit(contract, 'SharesActivated')
				.withArgs(deployer, tester);
		});

		it('should move inactive shares from old default recipient', async function () {
			const { contract, deployer, tester } = fixture;
			const shares = 10;

			await contract.setShares(deployer, shares, false);
			await contract.setDefaultRecipient(tester);

			let [active, total] = await contract.sharesFor(tester);
			expect(active, 'new active mismatch').to.eq(shares);
			expect(total, 'new total mismatch').to.eq(0);

			[active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'old active mismatch').to.eq(0);
			expect(total, 'old total mismatch').to.eq(0);
		});

		it('should set defaultRecipient', async function () {
			const { contract, tester } = fixture;

			await contract.setDefaultRecipient(tester);

			expect(await contract.defaultRecipient()).to.eq(tester);
		});

		it('should emit DefaultRecipientSet event', async function () {
			const { contract, deployer, tester } = fixture;

			await expect(contract.setDefaultRecipient(tester))
				.to.emit(contract, 'DefaultRecipientSet')
				.withArgs(deployer, tester);
		});
	});

	describe('setRewardsToken', function () {
		it('can only be called by owner', async function () {
			const { testerContract } = fixture;
			await expect(
				testerContract.setRewardsToken(zeroAddress),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should set rewardsToken', async function () {
			const { contract } = fixture;
			await contract.setRewardsToken(zeroAddress);
			expect(await contract.rewardsToken()).to.eq(zeroAddress);
		});

		it('should emit RewardsTokenSet event', async function () {
			const { contract, deployer } = fixture;
			await expect(contract.setRewardsToken(zeroAddress))
				.to.emit(contract, 'RewardsTokenSet')
				.withArgs(deployer, zeroAddress);
		});
	});

	describe('setShares', function () {
		it('can only be called by owner', async function () {
			const { testerContract, tester } = fixture;

			await expect(
				testerContract.setShares(tester, 1, true),
			).to.be.revertedWith('caller is not the owner');
		});

		it('should revert on zero address', async function () {
			const { contract } = fixture;

			await expect(
				contract.setShares(zeroAddress, 1, true),
			).to.be.revertedWith('cannot set shares for zero address');
		});

		it('should revert on contract address', async function () {
			const { contract } = fixture;

			await expect(
				contract.setShares(contract.address, 1, true),
			).to.be.revertedWith('cannot set shares for this contract address');
		});

		it('should set active shares for new recipient', async function () {
			const { contract, tester } = fixture;
			const shares = 10;

			await contract.setShares(tester, shares, true);

			let [active, total] = await contract.sharesFor(tester);
			expect(active, 'active shares mismatch').to.eq(shares);
			expect(total, 'total shares mismatch').to.eq(shares);

			[active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'defaultRecipient active shares mismatch').to.eq(0);
			expect(total, 'defaultRecipient total shares mismatch').to.eq(0);
		});

		it('should set inactive shares for new recipient', async function () {
			const { contract, tester } = fixture;
			const shares = 10;

			await contract.setShares(tester, shares, false);

			let [active, total] = await contract.sharesFor(tester);
			expect(active, 'target active shares mismatch').to.eq(0);
			expect(total, 'target total shares mismatch').to.eq(shares);

			[active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'defaultRecipient active shares mismatch').to.eq(shares);
			expect(total, 'defaultRecipient total shares mismatch').to.eq(0);
		});

		it('should set active shares for existing active recipient', async function () {
			const { contract, tester } = fixture;
			const shares = 10;
			const newShares = 15;

			await contract.setShares(tester, shares, true);
			await contract.setShares(tester, newShares, true);

			const [active, total] = await contract.sharesFor(tester);
			expect(active, 'active shares mismatch').to.eq(newShares);
			expect(total, 'total shares mismatch').to.eq(newShares);
		});

		it('should set active shares for existing inactive recipient', async function () {
			const { contract, tester } = fixture;
			const shares = 10;
			const newShares = 15;

			await contract.setShares(tester, shares, false);
			await contract.setShares(tester, newShares, true);

			let [active, total] = await contract.sharesFor(tester);
			expect(active, 'target active shares mismatch').to.eq(newShares);
			expect(total, 'target total shares mismatch').to.eq(newShares);

			[active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'defaultRecipient active shares mismatch').to.eq(0);
			expect(total, 'defaultRecipient total shares mismatch').to.eq(0);
		});

		it('should set inactive shares for existing active recipient', async function () {
			const { contract, tester } = fixture;
			const shares = 10;
			const newShares = 15;

			await contract.setShares(tester, shares, true);
			await contract.setShares(tester, newShares, false);

			let [active, total] = await contract.sharesFor(tester);
			expect(active, 'target active shares mismatch').to.eq(0);
			expect(total, 'target total shares mismatch').to.eq(newShares);

			[active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'defaultRecipient active shares mismatch').to.eq(
				newShares,
			);
			expect(total, 'defaultRecipient total shares mismatch').to.eq(0);
		});

		it('should set inactive shares for existing inactive recipient', async function () {
			const { contract, tester } = fixture;
			const shares = 10;
			const newShares = 15;

			await contract.setShares(tester, shares, false);
			await contract.setShares(tester, newShares, false);

			let [active, total] = await contract.sharesFor(tester);
			expect(active, 'target active shares mismatch').to.eq(0);
			expect(total, 'target total shares mismatch').to.eq(newShares);

			[active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'defaultRecipient active shares mismatch').to.eq(
				newShares,
			);
			expect(total, 'defaultRecipient total shares mismatch').to.eq(0);
		});

		it('should set shares to zero for existing recipient', async function () {
			const { contract, tester } = fixture;
			const shares = 10;

			await contract.setShares(tester, shares, true);
			await contract.setShares(tester, 0, true);

			const [active, total] = await contract.sharesFor(tester);
			expect(active, 'active shares mismatch').to.eq(0);
			expect(total, 'total shares mismatch').to.eq(0);
		});

		it('should update shares for defaultRecipient', async function () {
			const { contract, tester } = fixture;
			const tshares = 5;
			const shares = 10;
			const totalShares = tshares + shares;

			await contract.setShares(tester, tshares, false);
			await contract.setShares(defaultRecipient, shares, false);

			const [active, total] = await contract.sharesFor(defaultRecipient);
			expect(active, 'active shares mismatch').to.eq(totalShares);
			expect(total, 'total shares mismatch').to.eq(shares);
		});

		it('should emit SharesSet event', async function () {
			const { contract, deployer, tester } = fixture;
			const shares = 10;

			await expect(contract.setShares(tester, shares, false))
				.to.emit(contract, 'SharesSet')
				.withArgs(deployer, tester, shares, false);
		});
	});

	describe('totalRewardsAccrued', function () {
		it('should increase when rewards are received', async function () {
			const { contract, rewardsToken } = fixture;
			const amount = parseRewardsToken('10');

			await rewardsToken.mint(contract.address, amount);

			expect(await contract.totalRewardsAccrued()).to.eq(amount);
		});

		it('should handle overflow', async function () {
			const { contract, rewardsToken } = fixture;
			const amount = parseRewardsToken('10');

			await contract.setTotalRewardsRedeemed(MaxUint256);

			await rewardsToken.mint(contract.address, amount);

			expect(await contract.totalRewardsAccrued()).to.eq(amount.sub(1));
		});
	});
});
