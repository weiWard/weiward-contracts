import 'dotenv/config';
import {
	HardhatNetworkAccountsUserConfig,
	HardhatNetworkAccountUserConfig,
} from 'hardhat/types';
import { Wallet } from '@ethersproject/wallet';
import { parseEther } from '@ethersproject/units';

export function node_url(networkName: string): string {
	// Check for specific uri
	{
		const uri = process.env['ETH_NODE_URI_' + networkName.toUpperCase()];
		if (uri && uri !== '') {
			return uri;
		}
	}

	// Get generic uri
	let uri = process.env.ETH_NODE_URI;
	if (uri) {
		uri = uri.replace('{{networkName}}', networkName);
	}

	if (!uri || uri === '') {
		if (networkName === 'localhost') {
			return 'http://localhost:8545';
		} else if (networkName === 'ganache') {
			return 'http://localhost:7545';
		}
		return '';
	}

	if (uri.indexOf('{{') >= 0) {
		throw new Error(
			`invalid uri or network not supported by node provider : ${uri}`,
		);
	}

	return uri;
}

export function getDeployerKey(networkName: string): string {
	// Hardhat default index 0 address key
	const hardhatZero =
		'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

	if (networkName === 'debug') {
		return hardhatZero;
	}

	// Check for specific key
	{
		const privKey = process.env['DEPLOYER_KEY_' + networkName.toUpperCase()];
		if (privKey && privKey !== '') {
			return privKey;
		}
	}

	// Get generic key
	const privKey = process.env.DEPLOYER_KEY;
	if (!privKey || privKey === '') {
		return hardhatZero;
	}

	return privKey;
}

export function getUserKey(networkName: string): string {
	// Hardhat default index 2 address key
	const hardhatTwo =
		'5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';

	if (networkName === 'debug') {
		return hardhatTwo;
	}

	// Check for specific key
	{
		const privKey = process.env['USER_KEY_' + networkName.toUpperCase()];
		if (privKey && privKey !== '') {
			return privKey;
		}
	}

	// Get generic key
	const privKey = process.env.USER_KEY;
	if (!privKey || privKey === '') {
		return hardhatTwo;
	}

	return privKey;
}

export function accounts(networkName: string): string[] {
	return [
		getDeployerKey(networkName),
		// Hardhat default index 1 address key
		'59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
		getUserKey(networkName),
	];
}

export function hardhatAccounts(): HardhatNetworkAccountsUserConfig {
	const defaultBalance = parseEther('10000').toString();
	const debugAccounts = new Array<HardhatNetworkAccountUserConfig>(10);

	debugAccounts[0] = {
		privateKey: getDeployerKey('hardhat'),
		balance: defaultBalance,
	};

	for (let i = 1; i < debugAccounts.length; i++) {
		const wallet = Wallet.fromMnemonic(
			insecure_mnemonic,
			"m/44'/60'/0'/0/" + i,
		);
		debugAccounts[i] = {
			privateKey: wallet.privateKey,
			balance: defaultBalance,
		};
	}

	return debugAccounts;
}

export const insecure_mnemonic =
	'test test test test test test test test test test test junk';
