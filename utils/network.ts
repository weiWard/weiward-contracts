import 'dotenv/config';
import { HDAccountsUserConfig } from 'hardhat/types';

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
		// Hardhat default 0 address key
		return 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
	}

	return privKey;
}

export function accounts(networkName: string): string[] {
	return [getDeployerKey(networkName)];
}

export const insecure_mnemonic =
	'test test test test test test test test test test test junk';
export const debugAccounts: HDAccountsUserConfig = {
	mnemonic: insecure_mnemonic,
};
