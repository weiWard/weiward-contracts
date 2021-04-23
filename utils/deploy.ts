/* eslint-disable no-console */
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
	DeployFunction,
	DeployOptions,
	DeployResult,
} from 'hardhat-deploy/types';
import { Contract } from '@ethersproject/contracts';

export function getVersionTag(): string {
	const version = process.env.npm_package_version;
	if (!version) {
		throw Error('Cannot determine version');
	}
	return 'v' + version;
}

export function getVersionedDeps(deps: string[], version: string): string[] {
	return deps.map((dep) => {
		return dep + version;
	});
}

export function deployProxiedContractFn(
	contractName: string,
	version: string,
	salt: string,
	dependencies?: string[],
): DeployFunction {
	const func: DeployFunction = async function (
		hre: HardhatRuntimeEnvironment,
	) {
		const { deployments, getNamedAccounts } = hre;
		const { deploy } = deployments;

		const { deployer } = await getNamedAccounts();

		await deployProxiedContract(contractName, deployer, salt, deploy);

		// Never execute twice
		return true;
	};

	const id = contractName + version;
	func.tags = [id, version];
	func.id = id;
	const deps = ['ProxyAdmin'];
	if (dependencies) {
		deps.push(...dependencies);
	}
	func.dependencies = getVersionedDeps(deps, version);

	return func;
}

export async function deployProxiedContract(
	contractName: string,
	deployer: string,
	salt: string,
	deploy: (name: string, options: DeployOptions) => Promise<DeployResult>,
): Promise<DeployResult> {
	return await deploy(contractName, {
		from: deployer,
		log: true,
		proxy: {
			owner: deployer,
			methodName: 'init',
			proxyContract: 'OpenZeppelinTransparentProxy',
			viaAdminContract: 'ProxyAdmin',
		},
		args: [deployer],
		deterministicDeployment: salt,
	});
}

export async function deployOrUpgrade(
	contractName: string,
	salt: string,
	hre: HardhatRuntimeEnvironment,
): Promise<DeployResult> {
	const { deployments, getNamedAccounts, ethers } = hre;
	const { deploy } = deployments;
	const { deployer } = await getNamedAccounts();

	const proxy = await deployments.getOrNull(contractName);
	if (!proxy) {
		// Deploy new proxy and implementation
		console.log('Deploying new proxy and implementation...');
		return await deployProxiedContract(contractName, deployer, salt, deploy);
	}

	// Deploy new implementation
	const result = await deploy(contractName + '_Implementation', {
		contract: contractName,
		from: deployer,
		log: true,
		args: [deployer],
		deterministicDeployment: salt,
	});

	// Upgrade proxy
	console.log('Upgrading proxy implementation...');
	const signer = ethers.provider.getSigner(deployer);
	const pa = await deployments.get('ProxyAdmin');
	const proxyAdmin = new Contract(pa.address, pa.abi, signer);

	await proxyAdmin.upgrade(proxy.address, result.address);

	console.log(`Upgraded proxy implementation for ${contractName}`);

	return result;
}
