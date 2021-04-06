/* eslint-disable no-console */
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { ETHtx__factory, FeeLogic__factory } from '../build/types/ethers-v5';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, ethers } = hre;

	const { deployer } = await getNamedAccounts();

	const ethtxAddr = (await deployments.get('ETHtx')).address;
	const feeLogicAddr = (await deployments.get('FeeLogic')).address;
	const ethtxAmmAddr = (await deployments.get('ETHtxAMM')).address;

	const deployerSigner = ethers.provider.getSigner(deployer);

	const ethtx = ETHtx__factory.connect(ethtxAddr, deployerSigner);
	const feeLogicSetAddr = await ethtx.feeLogic();

	const feeLogic = FeeLogic__factory.connect(feeLogicAddr, deployerSigner);
	const isAmmExempt = await feeLogic.isExempt(ethtxAmmAddr);

	console.log(`expected feeLogic address: ${feeLogicAddr}`);
	console.log(`actual feelogic address: ${feeLogicSetAddr}`);
	console.log(`is AMM exempt: ${isAmmExempt}`);
};

export default func;
func.tags = ['read'];
func.dependencies = [];
func.skip = async function (): Promise<boolean> {
	return true;
};
