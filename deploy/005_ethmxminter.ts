import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { parseEther, parseUnits } from 'ethers/lib/utils';

import { getDeployedWETH } from '../utils/weth';
import { ETHmx__factory, ETHtx__factory } from '../build/types/ethers-v5';

const contractName = 'ETHmxMinter';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const ethmxAddr = (await deployments.get('ETHmx')).address;
	const ethtxAddr = (await deployments.get('ETHtx')).address;
	const ethtxAMMAddr = (await deployments.get('ETHtxAMM')).address;
	const mintGasPrice = parseUnits('1800', 9);
	const roiNum = 5;
	const roiDen = 1;
	const earlyThreshold = parseEther('1000');

	const chainId = await getChainId();
	const wethAddr = await getDeployedWETH(deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const result = await deploy(contractName, {
		from: deployer,
		log: true,
		args: [
			ethmxAddr,
			ethtxAddr,
			ethtxAMMAddr,
			wethAddr,
			mintGasPrice,
			roiNum,
			roiDen,
			earlyThreshold,
		],
	});

	const deployerSigner = ethers.provider.getSigner(deployer);

	const ethmx = ETHmx__factory.connect(ethmxAddr, deployerSigner);
	await ethmx.setMinter(result.address);

	const ethtx = ETHtx__factory.connect(ethtxAddr, deployerSigner);
	await ethtx.setMinter(result.address);
};

export default func;
func.tags = [contractName];
func.dependencies = ['ETHmx', 'ETHtx', 'ETHtxAMM'];
