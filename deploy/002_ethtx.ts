import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { ETHtx__factory } from '../build/types/ethers-v5';
import { zeroAddress } from '../test/helpers/address';
import { salt } from '../utils/create2';

const contractName = 'ETHtx';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, ethers } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const feeLogic = await deployments.get('FeeLogic');

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

		const ethtx = ETHtx__factory.connect(result.address, deployerSigner);
		await ethtx.postInit({
			feeLogic: feeLogic.address,
			minter: zeroAddress,
		});
	}

	// Never execute twice
	return true;
};

export default func;
func.tags = [contractName];
func.id = contractName;
func.dependencies = ['ProxyAdmin', 'FeeLogic'];
