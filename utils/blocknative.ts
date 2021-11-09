/* eslint-disable no-console */
import axios, { AxiosRequestConfig } from 'axios';
import 'dotenv/config';

export interface IBlocknativeGasPrice {
	block: number;
	price: number;
	maxPriorityFeePerGas: number;
	maxFeePerGas: number;
}

const baseURL = 'https://api.blocknative.com/gasprices/blockprices';
if (!process.env.BLOCKNATIVE_API_KEY) {
	throw Error('BLOCKNATIVE_API_KEY undefined');
}
const apiKey = process.env.BLOCKNATIVE_API_KEY;

export async function getGasPrice(): Promise<
	IBlocknativeGasPrice | undefined
> {
	const cfg: AxiosRequestConfig = {
		method: 'GET',
		headers: { Authorization: apiKey },
		baseURL,
		params: {
			confidenceLevels: 90,
		},
	};

	try {
		const res = await axios(cfg);
		const {
			blockPrices: [
				{
					blockNumber: block,
					estimatedPrices: [
						{
							price: price,
							maxPriorityFeePerGas: maxPriorityFeePerGas,
							maxFeePerGas: maxFeePerGas,
						},
					],
				},
			],
		} = res.data;

		return { block, price, maxPriorityFeePerGas, maxFeePerGas };
	} catch (err) {
		if (err.response) {
			const res = err.response;
			switch (res.status) {
				case 429:
					const { 'retry-after': retryAfter } = res.headers;
					console.warn(
						`Too many blocknative requests, retrying after ${retryAfter}s`,
					);
					await new Promise((resolve) =>
						setTimeout(resolve, retryAfter * 1000),
					);
					return getGasPrice();

				case 401:
					console.warn(`Unauthorized blocknative request: ${res.data.msg}`);
					break;

				default:
					console.warn(
						`Unknown blocknative response (${res.status}: ${res.statusText}): ${res.data.msg}`,
					);
					break;
			}
		} else {
			console.warn(`Unknown blocknative error: ${err}`);
		}
	}

	return undefined;
}
