import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { getOrDeployWETH } from '../utils/weth';
import { FeeLogic__factory } from '../build/types/ethers-v5';
import { salt } from '../utils/create2';

const contractName = 'ETHtxAMM';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const ethtx = await deployments.get('ETHtx');
	const feeLogicAddr = (await deployments.get('FeeLogic')).address;
	const oracle = await deployments.get('GasPrice');
	const targetCRatioNum = 2;
	const targetCRatioDen = 1;

	const chainId = await getChainId();
	const wethAddr = await getOrDeployWETH(deployer, deployments, chainId);
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
			viaAdminContract: 'DefaultProxyAdmin',
		},
		args: [
			deployer,
			ethtx.address,
			oracle.address,
			wethAddr,
			targetCRatioNum,
			targetCRatioDen,
		],
		deterministicDeployment: salt,
	});

	if (result.newlyDeployed) {
		const deployerSigner = ethers.provider.getSigner(deployer);
		const feeLogic = FeeLogic__factory.connect(feeLogicAddr, deployerSigner);
		await feeLogic.setExempt(result.address, true);
	}

	// Never execute twice
	return true;
};

export default func;
func.tags = [contractName];
func.id = contractName;
func.dependencies = ['ETHtx', 'FeeLogic', 'GasPrice'];
