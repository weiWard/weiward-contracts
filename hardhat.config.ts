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
const mnemonic = process.env.MNEMONIC ?? insecure_mnemonic;
const accounts: HDAccountsUserConfig = { mnemonic };
const deployer = process.env.DEPLOYER_ACCOUNT_INDEX
	? parseInt(process.env.DEPLOYER_ACCOUNT_INDEX, 10)
	: 0;
const tester = process.env.TESTER_ACCOUNT_INDEX
	? parseInt(process.env.TESTER_ACCOUNT_INDEX, 10)
	: 1;

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
			url: `https://goerli.infura.io/v3/${process.env.INFURA_TOKEN}`,
			accounts,
		},
		kovan: {
			url: `https://kovan.infura.io/v3/${process.env.INFURA_TOKEN}`,
			accounts,
		},
		rinkeby: {
			url: `https://rinkeby.infura.io/v3/${process.env.INFURA_TOKEN}`,
			accounts,
		},
		ropsten: {
			url: `https://ropsten.infura.io/v3/${process.env.INFURA_TOKEN}`,
			accounts,
		},
		mainnet: {
			url: `https://mainnet.infura.io/v3/${process.env.INFURA_TOKEN}`,
			accounts,
		},
	},
	solidity: {
		version: '0.7.5',
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
		deployer,
		// tests use this account when the deployer is undesirable
		tester,
	},
	abiExporter: {
		path: './build/abi',
		clear: true,
		flat: true,
		only: ['ETHtx', 'Frackt'],
	},
};

export default config;
