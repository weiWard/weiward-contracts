import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction, Deployment } from 'hardhat-deploy/types';
import { Contract } from 'ethers';

import { getOrDeployWETH } from '../utils/weth';
import { FeeLogic__factory } from '../build/types/ethers-v5';

const contractName = 'ETHtxAMMDiamond';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts, getChainId, ethers } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	const FacetCutAction = {
		Add: 0,
		Replace: 1,
		Remove: 2,
	};

	function getSelectors(contract: Deployment) {
		const selectors = contract.abi.reduce((acc, val) => {
			if (val.type === 'function') {
				acc.push(val.signature);
				return acc;
			} else {
				return acc;
			}
		}, []);
		return selectors;
	}

	const dCut = await deployments.get('DiamondCutFacet');
	const dLoupe = await deployments.get('DiamondLoupeFacet');
	const context = await deployments.get('ContextFacet');
	const ownable = await deployments.get('OwnableFacet');
	const ethtxAmmFacet = await deployments.get('ETHtxAMMFacet');

	const ethtxAddr = (await deployments.get('ETHtx')).address;
	const feeLogicAddr = (await deployments.get('FeeLogic')).address;
	const oracleAddr = (await deployments.get('GasPrice')).address;
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
		args: [
			[
				[dCut.address, FacetCutAction.Add, getSelectors(dCut)],
				[dLoupe.address, FacetCutAction.Add, getSelectors(dLoupe)],
				[context.address, FacetCutAction.Add, getSelectors(context)],
				[ownable.address, FacetCutAction.Add, getSelectors(ownable)],
				[
					ethtxAmmFacet.address,
					FacetCutAction.Add,
					getSelectors(ethtxAmmFacet),
				],
			],
			[deployer],
		],
	});

	const deployerSigner = ethers.provider.getSigner(deployer);

	const ethtxAmm = new Contract(result.address, result.abi, deployerSigner);
	await ethtxAmm.ethtxAMMFacetInit(
		ethtxAddr,
		oracleAddr,
		wethAddr,
		targetCRatioNum,
		targetCRatioDen,
	);

	const feeLogic = FeeLogic__factory.connect(feeLogicAddr, deployerSigner);
	await feeLogic.setExempt(result.address, true);
};

export default func;
func.tags = [contractName, 'ETHtxAMM'];
func.dependencies = [
	'ContextFacet',
	'DiamondCutFacet',
	'DiamondLoupeFacet',
	'ETHtx',
	'ETHtxAMMFacet',
	'FeeLogic',
	'GasPrice',
	'OwnableFacet',
];
