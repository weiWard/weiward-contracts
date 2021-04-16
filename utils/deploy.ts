import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

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

		await deploy(contractName, {
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
