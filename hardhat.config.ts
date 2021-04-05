import { HardhatUserConfig } from 'hardhat/config';
import dotenv from 'dotenv';
import { HDAccountsUserConfig } from 'hardhat/types';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-deploy';
import 'hardhat-abi-exporter';

dotenv.config();

// Use the ganache mnemonic to generate hardhat accounts. We can then verify
// deterministic deployments across both networks.
const insecure_mnemonic =
	'test test test test test test test test test test test junk';
const debugAccounts: HDAccountsUserConfig = { mnemonic: insecure_mnemonic };

// Read environment to setup accounts for deploying
const deployerKey = process.env.DEPLOYER_KEY ? process.env.DEPLOYER_KEY : '';
const accounts = [deployerKey];

function nodeUrl(networkName: string): string {
	return `https://${networkName}.infura.io/v3/${process.env.INFURA_TOKEN}`;
}

const config: HardhatUserConfig = {
	defaultNetwork: 'hardhat',
	networks: {
		hardhat: {
			accounts: debugAccounts,
			live: false, // default for localhost & hardhat
			saveDeployments: false,
		},
		localhost: {
			url: 'http://127.0.0.1:8545',
			accounts: debugAccounts,
			live: false,
		},
		ganache: {
			url: 'http://127.0.0.1:7545',
			accounts: debugAccounts,
			live: false,
		},
		goerli: {
			url: nodeUrl('goerli'),
			accounts,
		},
		kovan: {
			url: nodeUrl('kovan'),
			accounts,
		},
		rinkeby: {
			url: nodeUrl('rinkeby'),
			accounts,
		},
		ropsten: {
			url: nodeUrl('ropsten'),
			accounts,
		},
		mainnet: {
			url: nodeUrl('mainnet'),
			accounts,
		},
	},
	solidity: {
		version: '0.7.6',
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	paths: {
		sources: './contracts',
		tests: './test',
		cache: './build/cache',
		artifacts: './build/artifacts',
	},
	etherscan: {
		apiKey: process.env.ETHERSCAN_API_KEY,
	},
	// hardhat-deploy
	namedAccounts: {
		// deployer uses first account by default
		deployer: 0,
		// tests use this account when the deployer is undesirable
		tester: 1,
	},
	abiExporter: {
		path: './build/abi',
		clear: true,
		flat: true,
		only: [
			'ETHtx',
			'ETHtxAMM',
			'ETHtxRewardsManager',
			'ETHmx',
			'ETHmxMinter',
			'ETHmxRewards',
			'FeeLogic',
			'GasPrice',
			'LPRewards',
			'ProxyAdmin',
			'TransparentUpgradeableProxy',
			'ValuePerUNIV2',
			'WETH9',
		],
	},
};

export default config;
