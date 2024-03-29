import { DeploymentsExtension } from 'hardhat-deploy/dist/types';
import { JsonRpcSigner } from '@ethersproject/providers';
import { Contract } from '@ethersproject/contracts';

import SushiV2Factory from '../contracts/exchanges/mocks/SushiV2Factory.json';
import { zeroAddress } from '../test/helpers/address';
import { salt } from './create2';

const sushiFactoryAddresses = new Map([
	// ['1337', '0xc35DADB65012eC5796536bD9864eD8773aBc74C4'],
	['42', undefined], // kovan
	['4', undefined], // rinkeby
	['3', '0xc35DADB65012eC5796536bD9864eD8773aBc74C4'], // ropsten
	['1', '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'], // mainnet
]);

const sushiPairAddresses = new Map([
	['42', undefined], // kovan
	['4', undefined], // rinkeby
	['3', '0x6BD807AdCE1e9Ad7c4060891dFACAeA368787830'], // ropsten
	['1', '0xA2Aa2C632Dd676f501f92ABAeCbd09EeDF64C737'], // mainnet
]);

const sushiRouterAddresses = new Map([
	['42', undefined], // kovan
	['4', undefined], // rinkeby
	['3', '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'], // ropsten
	['1', '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'], // mainnet
]);

export async function getOrDeploySushiFactory(
	deployer: string,
	signer: JsonRpcSigner,
	deployments: DeploymentsExtension,
	chainId: string,
): Promise<Contract | undefined> {
	let address: string | undefined = undefined;

	switch (chainId) {
		// kovan
		case '42':
		// rinkeby
		case '4':
		// ganache
		case '1337':
		// hardhat
		case '31337': {
			const { deploy } = deployments;
			const result = await deploy('SushiV2Factory', {
				contract: {
					abi: SushiV2Factory.abi,
					bytecode: SushiV2Factory.bytecode,
				},
				from: deployer,
				log: true,
				args: [deployer],
				deterministicDeployment: salt,
			});
			address = result.address;
			break;
		}
		default: {
			address = sushiFactoryAddresses.get(chainId);
			break;
		}
	}

	if (!address) {
		return undefined;
	}

	return new Contract(address, JSON.stringify(SushiV2Factory.abi), signer);
}

export async function getDeployedSushiFactory(
	deployments: DeploymentsExtension,
	chainId: string,
): Promise<string | undefined> {
	let address = sushiFactoryAddresses.get(chainId);
	if (!address) {
		if (chainId === '1') {
			return undefined;
		}
		address = (await deployments.get('SushiV2Factory')).address;
	}
	return address;
}

export async function getOrDeploySushiPair(
	deployer: string,
	signer: JsonRpcSigner,
	deployments: DeploymentsExtension,
	chainId: string,
	ethtxAddr: string,
	wethAddr: string,
): Promise<string | undefined> {
	let address: string | undefined = undefined;

	switch (chainId) {
		// kovan
		case '42':
		// rinkeby
		case '4':
		// ropsten
		case '3':
		// ganache
		case '1337':
		// hardhat
		case '31337': {
			const factory = await getOrDeploySushiFactory(
				deployer,
				signer,
				deployments,
				chainId,
			);
			if (!factory) {
				return undefined;
			}

			const pairAddr = await factory.getPair(ethtxAddr, wethAddr);
			if (pairAddr != zeroAddress) {
				address = pairAddr;
				break;
			}

			await factory.createPair(ethtxAddr, wethAddr);
			address = await factory.getPair(ethtxAddr, wethAddr);
			break;
		}
		default: {
			address = sushiPairAddresses.get(chainId);
			break;
		}
	}

	return address;
}

export async function getDeployedSushiPair(
	deployments: DeploymentsExtension,
	chainId: string,
	signer: JsonRpcSigner,
	ethtxAddr: string,
	wethAddr: string,
): Promise<string | undefined> {
	let address = sushiPairAddresses.get(chainId);
	if (!address) {
		const factoryAddr = await getDeployedSushiFactory(deployments, chainId);
		if (!factoryAddr) {
			return undefined;
		}
		const factory = new Contract(
			factoryAddr,
			JSON.stringify(SushiV2Factory.abi),
			signer,
		);
		address = await factory.getPair(ethtxAddr, wethAddr);
	}
	return address;
}

export async function getOrDeploySushiRouter(
	deployer: string,
	signer: JsonRpcSigner,
	deployments: DeploymentsExtension,
	chainId: string,
	wethAddr: string,
): Promise<string | undefined> {
	let address: string | undefined = undefined;

	switch (chainId) {
		// kovan
		case '42':
		// rinkeby
		case '4':
		// ganache
		case '1337':
		// hardhat
		case '31337': {
			const factory = await getOrDeploySushiFactory(
				deployer,
				signer,
				deployments,
				chainId,
			);
			if (!factory) {
				return undefined;
			}

			const { deploy } = deployments;

			const result = await deploy('MockSushiV2Router02', {
				from: deployer,
				log: true,
				args: [factory.address, wethAddr],
				deterministicDeployment: salt,
			});
			address = result.address;
			break;
		}
		default: {
			address = sushiRouterAddresses.get(chainId);
			break;
		}
	}

	return address;
}

export async function getDeployedSushiRouter(
	deployments: DeploymentsExtension,
	chainId: string,
): Promise<string | undefined> {
	let address = sushiRouterAddresses.get(chainId);
	if (!address) {
		if (chainId === '1') {
			return undefined;
		}
		address = (await deployments.get('MockSushiV2Router02')).address;
	}
	return address;
}
