import { deployments, network } from 'hardhat';
import axios, { AxiosRequestConfig } from 'axios';
import qs from 'qs';

const { ETHERSCAN_API_KEY } = process.env;

const main = async (): Promise<void> => {
	const allDeployments = await deployments.all();

	const proxiesNames = Object.entries(allDeployments)
		.map(([key]) => key)
		.filter((name) => name.match(/Proxy$/g));

	try {
		for (const proxyName of proxiesNames) {
			console.log(`Verifying ${proxyName}...`);
			const proxy = allDeployments[proxyName];
			const implementation =
				allDeployments[proxyName.replace('Proxy', 'Implementation')];

			const apiSubdomain =
				network.name === 'mainnet' ? 'api' : `api-${network.name}`;
			const url = `https://${apiSubdomain}.etherscan.io/api?module=contract&action=verifyproxycontract&apikey=${ETHERSCAN_API_KEY}`;
			const options: AxiosRequestConfig = {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				data: qs.stringify({
					address: proxy.address,
					expectedimplementation: implementation.address,
				}),
				url,
			};
			const {
				data: { message: okOrNotOk, result: guidOrError },
			} = await axios(options);

			if (okOrNotOk === 'NOTOK') {
				console.log(`Verification failed. Reason: ${guidOrError}`);
			} else {
				console.log(`Verification request sent.`);
				console.log(
					`To check the request status, use ${guidOrError} as GUID.`,
				);
			}
		}
	} catch (e) {
		console.log(`Error: ${e}`);
	}
};

main();
