import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { parseUnits, formatUnits } from 'ethers/lib/utils';

import { ETHmxMinter__factory } from '../build/types/ethers-v5';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, ethers } = hre;

	const { deployer } = await getNamedAccounts();

	const ethmxMinterAddr = (await deployments.get('ETHmxMinter')).address;
	const mintGasPrice = parseUnits('1000', 9);

	const deployerSigner = ethers.provider.getSigner(deployer);

	const ethmxMinter = ETHmxMinter__factory.connect(
		ethmxMinterAddr,
		deployerSigner,
	);
	await ethmxMinter.setMintGasPrice(mintGasPrice);

	// eslint-disable-next-line no-console
	console.log(`Set mint gas price to ${formatUnits(mintGasPrice, 9)} Gwei`);

	// Never execute twice
	return true;
};

export default func;
func.tags = ['setMintGasPrice'];
func.id = 'setMintGasPrice';
func.dependencies = ['ETHmxMinter'];
func.skip = async function (): Promise<boolean> {
	return false;
};
