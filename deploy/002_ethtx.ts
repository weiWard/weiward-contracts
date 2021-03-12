import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { zeroAddress } from '../test/helpers/address';
import { getOrDeployWETH } from '../utils/weth';

const contractName = 'ETHtx';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const oracle = await deployments.get('GasPrice');
	const feeLogic = await deployments.get('FeeLogic');
	const targetCRatioNum = 2;
	const targetCRatioDen = 1;

	const chainId = await getChainId();
	const wethAddr = await getOrDeployWETH(deployer, deployments, chainId);
	if (!wethAddr) {
		throw new Error('WETH address undefined for current network');
	}

	await deploy(contractName, {
		from: deployer,
		log: true,
		args: [
			feeLogic.address,
			oracle.address,
			zeroAddress,
			wethAddr,
			targetCRatioNum,
			targetCRatioDen,
		],
	});
};

export default func;
func.tags = [contractName];
func.dependencies = ['GasPrice', 'FeeLogic'];
