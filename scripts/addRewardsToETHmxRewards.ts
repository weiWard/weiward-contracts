/* eslint-disable no-console */
import hre from 'hardhat';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';

import { wethAddresses } from '../utils/weth';
import { sendWETH } from '../test/helpers/conversions';
import {
	WETH9__factory,
	ETHmxRewards__factory,
} from '../build/types/ethers-v5';
import { formatEther, parseEther } from 'ethers/lib/utils';

const { deployments, getNamedAccounts, getChainId, ethers } = hre;

(async (): Promise<void> => {
	const chainId = await getChainId();

	if (chainId == '1') {
		throw new Error('Reverting on attempt to send WETH on homestead.');
	}

	const { user } = await getNamedAccounts();
	if (!user) {
		throw new Error('User account is undefined');
	}

	const signer = ethers.provider.getSigner(user);
	const wethAddr = wethAddresses.get(chainId);
	if (!wethAddr || wethAddr.length == 0) {
		throw new Error('WETH address not set for network');
	}
	const ethmxRewardsAddr = (await deployments.get('ETHmxRewards')).address;

	const weth = WETH9__factory.connect(wethAddr, signer);
	const ethmxRewards = ETHmxRewards__factory.connect(ethmxRewardsAddr, signer);

	const amount = parseEther('0.1');
	console.log(
		`Sending ${formatEther(amount)} WETH from ${user} to ${ethmxRewardsAddr}`,
	);
	await sendWETH(weth, ethmxRewardsAddr, amount);
	console.log(`Updating accrual...`);
	try {
		await ethmxRewards.updateAccrual({ gasLimit: 300000 });
	} catch (err) {
		console.log(`Failed to call updateAccrual: ${err}`);
		return;
	}

	console.log(
		'Sent WETH to the ETHmxRewards contract and called updateAccrual',
	);
})();
