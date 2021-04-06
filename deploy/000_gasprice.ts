import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { parseUnits, solidityKeccak256 } from 'ethers/lib/utils';

import { GasPrice__factory } from '../build/types/ethers-v5';
import { salt } from '../utils/create2';

const contractName = 'GasPrice';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, ethers } = hre;
	const { deploy } = deployments;

	const { deployer, gasOracle } = await getNamedAccounts();

	const updateThreshold = 32400; // 9 hours
	const gasPrice = parseUnits('200', 9);

	const result = await deploy(contractName, {
		from: deployer,
		log: true,
		args: [deployer, updateThreshold, gasPrice],
		deterministicDeployment: salt,
	});

	if (result.newlyDeployed && gasOracle && gasOracle !== '') {
		const oracleRole = solidityKeccak256(['string'], ['ORACLE_ROLE']);
		const deployerSigner = ethers.provider.getSigner(deployer);

		const oracle = GasPrice__factory.connect(result.address, deployerSigner);
		await oracle.grantRole(oracleRole, gasOracle);
	}

	// Never execute twice (due to create2)
	return true;
};

export default func;
func.tags = [contractName];
func.id = contractName;
