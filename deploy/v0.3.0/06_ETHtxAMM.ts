import { deployProxiedContractFn } from '../../utils/deploy';

const version = 'v0.3.0';
import { salt } from '../../utils/create2';

const func = deployProxiedContractFn('ETHtxAMM', version, salt);
export default func;
