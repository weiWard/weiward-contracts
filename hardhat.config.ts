import { HardhatUserConfig } from 'hardhat/config';
import 'dotenv/config';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-deploy';
import 'hardhat-abi-exporter';

import { node_url, accounts, debugAccounts } from './utils/network';

const config: HardhatUserConfig = {
	defaultNetwork: 'hardhat',
	networks: {
		hardhat: {
			accounts: debugAccounts,
			live: false, // default for localhost & hardhat
			saveDeployments: false,
		},
		localhost: {
			url: node_url('localhost'),
			accounts: debugAccounts,
			live: false,
		},
		ganache: {
			url: node_url('ganache'),
			accounts: debugAccounts,
			live: false,
		},
		goerli: {
			url: node_url('goerli'),
			accounts: accounts('goerli'),
		},
		kovan: {
			url: node_url('kovan'),
			accounts: accounts('kovan'),
		},
		rinkeby: {
			url: node_url('rinkeby'),
			accounts: accounts('rinkeby'),
		},
		ropsten: {
			url: node_url('ropsten'),
			accounts: accounts('ropsten'),
		},
		mainnet: {
			url: node_url('mainnet'),
			accounts: accounts('mainnet'),
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
