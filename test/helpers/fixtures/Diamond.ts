import { Signer } from 'ethers';
import {
	DiamondCutFacet,
	DiamondCutFacet__factory,
	DiamondLoupeFacet,
	DiamondLoupeFacet__factory,
	LibDiamond,
	LibDiamond__factory,
} from '../../../build/types/ethers-v5';

export interface DiamondFacetsFixture {
	libDiamond: LibDiamond;
	diamondCutFacet: DiamondCutFacet;
	diamondLoupeFacet: DiamondLoupeFacet;
}

export async function diamondFacetsFixture(
	signer: Signer,
): Promise<DiamondFacetsFixture> {
	const libDiamond = await new LibDiamond__factory(signer).deploy();
	const diamondCutFacet = await new DiamondCutFacet__factory(signer).deploy();
	const diamondLoupeFacet = await new DiamondLoupeFacet__factory(
		signer,
	).deploy();

	return {
		libDiamond,
		diamondCutFacet,
		diamondLoupeFacet,
	};
}
