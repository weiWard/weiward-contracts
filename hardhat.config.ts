import { HardhatUserConfig, task } from 'hardhat/config';
import 'dotenv/config';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-deploy';
import 'hardhat-abi-exporter';
import { Deployment } from 'hardhat-deploy/dist/types';
import * as fs from 'fs';

import { node_url, accounts, hardhatAccounts } from './utils/network';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ALCHEMY_URI = process.env.ALCHEMY_URI ? process.env.ALCHEMY_URI : '';

/* eslint-disable no-console */
task(
	'list-deployments',
	'List all deployed contracts on a network',
	async (_args, hre) => {
		console.log(`All deployments on ${hre.network.name}`);
		for (const [name, deployment] of Object.entries(
			await hre.deployments.all(),
		)) {
			console.log(`${name}: ${deployment.address}`);
		}
	},
);

task(
	'export-addresses',
	'Export deployment addresses to JSON file',
	async (_args, hre) => {
		const path = './build/addresses.json';
		const addresses: Record<string, unknown> = fs.existsSync(path)
			? JSON.parse(fs.readFileSync(path).toString())
			: {};
		const networkAddresses = Object.entries(await hre.deployments.all()).map(
			([name, deployRecord]: [string, Deployment]) => {
				return [name, deployRecord.address];
			},
		);
		addresses[hre.network.name] = Object.fromEntries(networkAddresses);
		const stringRepresentation = JSON.stringify(addresses, null, 2);
		console.log(addresses);

		fs.writeFileSync('./build/addresses.json', stringRepresentation);
	},
);
/* eslint-enable no-console */

const config: HardhatUserConfig = {
	defaultNetwork: 'hardhat',
	networks: {
		hardhat: {
			chainId: 1337, // compatibility with metamask
			accounts: hardhatAccounts(),
			live: false, // default for localhost & hardhat
			saveDeployments: false,
			forking: {
				url: ALCHEMY_URI,
				blockNumber: 10078689,
				enabled: false,
			},
		},
		localhost: {
			url: node_url('localhost'),
			accounts: accounts('localhost'),
			live: false,
		},
		ganache: {
			url: node_url('ganache'),
			accounts: accounts('ganache'),
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
		compilers: [
			{
				version: '0.7.6',
				settings: {
					optimizer: {
						enabled: true,
						runs: 200,
					},
				},
			},
			{
				version: '0.6.12',
				settings: {
					evmVersion: 'istanbul',
					optimizer: {
						enabled: true,
						runs: 200,
					},
				},
			},
			{
				version: '0.6.6',
				settings: {
					evmVersion: 'istanbul',
					optimizer: {
						enabled: true,
						runs: 999999,
					},
				},
			},
		],
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
		// Run scripts from this user
		user: 2,
		// Gas oracle service
		gasOracleService: {
			// mainnet
			1: '',
			// ropsten
			3: '0x97D46CE03376a059C3Fb84c6c297080166b06E0b',
		},
	},
	abiExporter: {
		path: './build/abi',
		clear: true,
		flat: true,
		only: [
			'ERC20',
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
