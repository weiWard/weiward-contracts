import { DeploymentsExtension } from 'hardhat-deploy/dist/types';
import { JsonRpcSigner } from '@ethersproject/providers';
import { Contract } from '@ethersproject/contracts';
import UniswapV2Factory from '@sushiswap/core/build/contracts/UniswapV2Factory.json';

import { zeroAddress } from '../test/helpers/address';

const sushiFactoryAddresses = new Map([
	['42', undefined], // kovan
	['4', undefined], // rinkeby
	['3', undefined], // ropsten
	['1', '0x0'], // mainnet
]);

const sushiPairAddresses = new Map([
	['42', undefined], // kovan
	['4', undefined], // rinkeby
	['3', undefined], // ropsten
	['1', undefined], // mainnet
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
		// ropsten
		case '3':
		// ganache
		case '1337':
		// hardhat
		case '31337': {
			const { deploy } = deployments;
			const result = await deploy('SushiV2Factory', {
				contract: {
					abi: UniswapV2Factory.abi,
					bytecode: UniswapV2Factory.bytecode,
				},
				from: deployer,
				log: true,
				args: [deployer],
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

	return new Contract(address, JSON.stringify(UniswapV2Factory.abi), signer);
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
