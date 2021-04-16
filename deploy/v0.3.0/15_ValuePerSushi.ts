import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getOrDeployWETH } from '../../utils/weth';
import { getDeployedSushiPair } from '../../utils/sushi';
import { zeroAddress } from '../../test/helpers/address';
import { salt } from '../../utils/create2';
import { getVersionedDeps } from '../../utils/deploy';

const version = 'v0.3.0';
const contractName = 'ValuePerSushi';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const ethtxAddr = (await deployments.get('ETHtx')).address;

	const chainId = await getChainId();
	const wethAddr = await getOrDeployWETH(deployer, deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const deployerSigner = ethers.provider.getSigner(deployer);

	const pairAddr = await getDeployedSushiPair(
		deployments,
		chainId,
		deployerSigner,
		ethtxAddr,
		wethAddr,
	);
	if (!pairAddr) {
		throw new Error('Sushi pair address undefined for current network');
	} else if (pairAddr == zeroAddress) {
		throw new Error('Sushi pair address is zero address for current network');
	}

	await deploy(contractName, {
		contract: 'ValuePerUNIV2',
		from: deployer,
		log: true,
		args: [pairAddr, wethAddr],
		deterministicDeployment: salt,
	});

	// Never execute twice
	return true;
};

const id = contractName + version;

export default func;
func.tags = [id, version];
func.id = id;
func.dependencies = getVersionedDeps(
	['WETH', 'ETHtx', 'SushiV2Pair'],
	version,
);
