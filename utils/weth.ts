import { DeploymentsExtension } from 'hardhat-deploy/dist/types';

export const wethAddresses = new Map([
	['42', undefined], // kovan
	['4', undefined], // rinkeby
	['3', undefined], // ropsten
	['1', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'], // mainnet
]);

export async function getOrDeployWETH(
	deployer: string,
	deployments: DeploymentsExtension,
	chainId: string,
): Promise<string | undefined> {
	let wethAddr: string | undefined = undefined;

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
			const result = await deploy('WETH9', {
				from: deployer,
				log: true,
			});
			wethAddr = result.address;
			break;
		}
		default: {
			wethAddr = wethAddresses.get(chainId);
			break;
		}
	}

	return wethAddr;
}

export async function getDeployedWETH(
	deployments: DeploymentsExtension,
	chainId: string,
): Promise<string | undefined> {
	let wethAddr: string | undefined = undefined;

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
			const weth = await deployments.get('WETH9');
			wethAddr = weth.address;
			break;
		}
		default: {
			wethAddr = wethAddresses.get(chainId);
			break;
		}
	}

	return wethAddr;
}