/* eslint-disable no-console */
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { FeeLogic__factory } from '../build/types/ethers-v5';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, ethers } = hre;

	const { deployer } = await getNamedAccounts();

	const feeLogicAddr = (await deployments.get('FeeLogic')).address;
	const ethtxAmmAddr = (await deployments.get('ETHtxAMM')).address;

	const deployerSigner = ethers.provider.getSigner(deployer);

	const feeLogic = FeeLogic__factory.connect(feeLogicAddr, deployerSigner);
	await feeLogic.setExempt(ethtxAmmAddr, true);

	console.log('Set ETHtxAMM exempt');
};

export default func;
func.tags = ['setAmmExempt'];
func.dependencies = [];
func.skip = async function (): Promise<boolean> {
	return true;
};
