import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { salt } from '../../utils/create2';
import { getVersionedDeps } from '../../utils/deploy';

const version = 'v0.3.0';
const contractName = 'FeeLogic';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const ethtxAmmAddr = (await deployments.get('ETHtxAMM')).address;
	const ethmxMinterAddr = (await deployments.get('ETHmxMinter')).address;
	const ethtxRewardsMgrAddr = (await deployments.get('ETHtxRewardsManager'))
		.address;

	const feeRecipient = ethtxRewardsMgrAddr;
	const feeNum = 75;
	const feeDen = 1000;

	await deploy(contractName, {
		from: deployer,
		log: true,
		args: [
			deployer,
			feeRecipient,
			feeNum,
			feeDen,
			[
				{ account: ethtxAmmAddr, isExempt: true },
				{ account: ethmxMinterAddr, isExempt: true },
				{ account: ethtxRewardsMgrAddr, isExempt: true },
			],
		],
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
	['ETHtxAMM', 'ETHmxMinter', 'ETHtxRewardsManager'],
	version,
);
