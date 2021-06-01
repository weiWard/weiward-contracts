import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getVersionedDeps } from '../../utils/deploy';
import { getDeployedWETH } from '../../utils/weth';
import { zeroAddress } from '../../test/helpers/address';
import { getOrDeploySushiPair } from '../../utils/sushi';

const version = 'v0.3.0';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deployer } = await getNamedAccounts();
	const chainId = await getChainId();

	const ethtxAddr = (await deployments.get('ETHtx')).address;

	const wethAddr = await getDeployedWETH(deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const deployerSigner = ethers.provider.getSigner(deployer);

	const sushiPairAddr = await getOrDeploySushiPair(
		deployer,
		deployerSigner,
		deployments,
		chainId,
		ethtxAddr,
		wethAddr,
	);
	if (!sushiPairAddr) {
		throw new Error('SushiV2Pair address undefined for current network');
	} else if (sushiPairAddr == zeroAddress) {
		throw new Error('SushiV2Pair address is zero for current network');
	}

	// eslint-disable-next-line no-console
	console.log(`SLP ETHtx-WETH: ${sushiPairAddr}`);

	return true;
};

const id = 'SushiV2Pair' + version;

export default func;
func.tags = [id, version];
func.id = id;
func.dependencies = getVersionedDeps(
	['WETH', 'ETHtx', 'SushiV2Factory'],
	version,
);
