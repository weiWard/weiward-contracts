import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { parseEther, parseUnits } from 'ethers/lib/utils';

import { getDeployedWETH } from '../utils/weth';
import {
	ETHmx__factory,
	ETHmxMinter__factory,
	ETHtx__factory,
} from '../build/types/ethers-v5';
import { salt } from '../utils/create2';

const contractName = 'ETHmxMinter';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const ethmxAddr = (await deployments.get('ETHmx')).address;
	const ethtxAddr = (await deployments.get('ETHtx')).address;
	const ethtxAMMAddr = (await deployments.get('ETHtxAMM')).address;
	const mintGasPrice = parseUnits('1000', 9);
	const roiNumerator = 5;
	const roiDenominator = 1;
	const earlyThreshold = parseEther('1000');

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

		const ethmxMinter = ETHmxMinter__factory.connect(
			result.address,
			deployerSigner,
		);

		await ethmxMinter.postInit({
			ethmx: ethmxAddr,
			ethtx: ethtxAddr,
			ethtxAMM: ethtxAMMAddr,
			weth: wethAddr,
			mintGasPrice,
			roiNumerator,
			roiDenominator,
			earlyThreshold,
		});

		const ethmx = ETHmx__factory.connect(ethmxAddr, deployerSigner);
		await ethmx.setMinter(result.address);

		const ethtx = ETHtx__factory.connect(ethtxAddr, deployerSigner);
		await ethtx.setMinter(result.address);
	}

	// Never execute twice
	return true;
};

export default func;
func.tags = [contractName];
func.id = contractName;
func.dependencies = ['ProxyAdmin', 'ETHmx', 'ETHtx', 'ETHtxAMM'];
