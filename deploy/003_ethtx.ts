import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { zeroAddress } from '../test/helpers/address';

const contractName = 'ETHtx';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const feeLogic = await deployments.get('FeeLogic');

	await deploy(contractName, {
		from: deployer,
		log: true,
		args: [feeLogic.address, zeroAddress],
	});
};

export default func;
func.tags = [contractName];
func.dependencies = ['FeeLogic'];
