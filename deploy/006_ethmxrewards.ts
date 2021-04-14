import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { ETHmxRewards__factory } from '../build/types/ethers-v5';
import { getDeployedWETH } from '../utils/weth';
import { salt } from '../utils/create2';

const contractName = 'ETHmxRewards';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const ethmx = await deployments.get('ETHmx');
	const accrualUpdateInterval = 86400; // 24 hours

	const chainId = await getChainId();
	const wethAddr = await getDeployedWETH(deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const result = await deploy(contractName, {
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

	if (result.newlyDeployed) {
		const deployerSigner = ethers.provider.getSigner(deployer);

		const ethmxRewards = ETHmxRewards__factory.connect(
			result.address,
			deployerSigner,
		);
		await ethmxRewards.postInit({
			ethmx: ethmx.address,
			weth: wethAddr,
			accrualUpdateInterval,
		});
	}

	// Never execute twice
	return true;
};

export default func;
func.tags = [contractName];
func.id = contractName;
func.dependencies = ['ETHmx'];
