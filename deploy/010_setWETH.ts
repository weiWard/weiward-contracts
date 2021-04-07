import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getOrDeployWETH } from '../utils/weth';
import {
	ETHmx__factory,
	ETHtx__factory,
	ETHtxAMM__factory,
} from '../build/types/ethers-v5';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;

	const { deployer } = await getNamedAccounts();

	const ethmxAddr = (await deployments.get('ETHmx')).address;
	const ethmxMinterAddr = (await deployments.get('ETHmxMinter')).address;
	const ethtxAddr = (await deployments.get('ETHtx')).address;
	const ethtxAmmAddr = (await deployments.get('ETHtxAMM')).address;

	const chainId = await getChainId();
	const wethAddr = await getOrDeployWETH(deployer, deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const deployerSigner = ethers.provider.getSigner(deployer);

	const ethtxAmm = ETHtxAMM__factory.connect(ethtxAmmAddr, deployerSigner);
	await ethtxAmm.setWETH(wethAddr);

	const ethmx = ETHmx__factory.connect(ethmxAddr, deployerSigner);
	await ethmx.setMinter(ethmxMinterAddr);

	const ethtx = ETHtx__factory.connect(ethtxAddr, deployerSigner);
	await ethtx.setMinter(ethmxMinterAddr);

	// Change with setter
	// AMM

	// Deploy new
	// ETHmxMinter
	// ETHmxRewards
	// ETHtxRewardsManager
	// LPRewards
	// ValuePerSushi

	// eslint-disable-next-line no-console
	console.log('Updated contracts for new WETH address');
};

export default func;
func.tags = ['setWETH'];
func.dependencies = [];
func.skip = async function (): Promise<boolean> {
	return true;
};
