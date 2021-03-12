import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { zeroPadAddress } from '../test/helpers/address';

const contractName = 'FeeLogic';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const feeRecipient = zeroPadAddress('0x2');
	const feeNum = 75;
	const feeDen = 1000;

	await deploy(contractName, {
		from: deployer,
		log: true,
		args: [feeRecipient, feeNum, feeDen],
	});
};

export default func;
func.tags = [contractName];
