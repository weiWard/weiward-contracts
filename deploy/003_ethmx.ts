import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { parseEther, parseUnits } from 'ethers/lib/utils';

import { getDeployedWETH } from '../utils/weth';
import { ETHtx__factory } from '../build/types/ethers-v5';

const contractName = 'ETHmx';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const ethtx = await deployments.get('ETHtx');
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
			ethtx.address,
			wethAddr,
			mintGasPrice,
			roiNum,
			roiDen,
			earlyThreshold,
		],
	});

	const deployerSigner = ethers.provider.getSigner(deployer);
	const ethtxContract = ETHtx__factory.connect(ethtx.address, deployerSigner);
	await ethtxContract.setMinter(result.address);
};

export default func;
func.tags = [contractName];
func.dependencies = ['ETHtx'];
