import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getOrDeployWETH } from '../utils/weth';
import { getOrDeploySushiPair } from '../utils/sushi';
import { zeroAddress } from '../test/helpers/address';
import { LPRewards__factory } from '../build/types/ethers-v5';
import { salt } from '../utils/create2';

const contractName = 'ValuePerSushi';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const ethtxAddr = (await deployments.get('ETHtx')).address;
	const lpRewardsAddr = (await deployments.get('LPRewards')).address;

	const chainId = await getChainId();
	const wethAddr = await getOrDeployWETH(deployer, deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	const deployerSigner = ethers.provider.getSigner(deployer);

	const pairAddr = await getOrDeploySushiPair(
		deployer,
		deployerSigner,
		deployments,
		chainId,
		ethtxAddr,
		wethAddr,
	);
	if (!pairAddr) {
		throw new Error('Sushi pair address undefined for current network');
	} else if (pairAddr == zeroAddress) {
		throw new Error('Sushi pair address is zero address for current network');
	}

	// eslint-disable-next-line no-console
	console.log(`SLP ETHtx-WETH: ${pairAddr}`);

	const result = await deploy(contractName, {
		contract: 'ValuePerUNIV2',
		from: deployer,
		log: true,
		args: [pairAddr, wethAddr],
		deterministicDeployment: salt,
	});

	if (result.newlyDeployed) {
		const lpRewards = LPRewards__factory.connect(
			lpRewardsAddr,
			deployerSigner,
		);
		await lpRewards.addToken(pairAddr, result.address);
	}

	// Never execute twice
	return true;
};

export default func;
func.tags = [contractName];
func.id = contractName;
func.dependencies = ['ETHtx', 'LPRewards'];
