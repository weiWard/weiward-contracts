# weiward-contracts

![banner](assets/banner.png)

[![license](https://img.shields.io/badge/license-MIT%2FApache--2.0-763474)](#license)

Smart contracts for the weiWard platform.

## Table of Contents

<details>
<summary><strong>Expand</strong></summary>

- [Install](#install)
- [Usage](#usage)
- [Editor Setup](#editor-setup)
	- [VS Code](#vs-code)
- [Contributing](#contributing)
- [License](#license)

</details>

## Install

This repository requires some knowledge of:

* [Solidity](https://solidity.readthedocs.io/en/latest/)
* [npm](https://docs.npmjs.com/)
* [TypeScript](https://www.typescriptlang.org/) (for tests)
* [hardhat](https://hardhat.org/)

1. Install npm and [pnpm](https://pnpm.js.org/), preferably using
[nvm](https://github.com/nvm-sh/nvm) or
[nvm-windows](https://github.com/coreybutler/nvm-windows).

	```bash
	nvm install 14.15.1
	nvm use 14.15.1
	npm i -g pnpm
	# Check installation
	node --version
	npm --version
	pnpm --version
	```

2. Install dependencies

	```bash
	pnpm install
	```

## Usage

```bash
# Lint
npm run lint
# Compile contracts, export ABIs, and generate TypeScript interfaces
npm run compile
# Run tests
npm run test
# Deploy to hardhat network
npm run deploy
# Verify deployed contracts on Etherscan
npm run verify -- --network mainnet
# Export ABI and addresses for deployed contracts to build/abi.json.
npm run export -- --network mainnet
# Export ABI and addresses for deployed contracts across all networks to build/abi.json.
npm run export:all
# Flatten a file
npx truffle-flattener <file> > flattened/<file>
```

## Editor Setup

### VS Code

1. Install the [solidity](https://marketplace.visualstudio.com/items?itemName=JuanBlanco.solidity) extension.
2. Add the following to your settings file to fix imports ([issue](https://github.com/juanfranblanco/vscode-solidity/issues/178)):
	```json
	"solidity.packageDefaultDependenciesContractsDirectory": "",
	"solidity.packageDefaultDependenciesDirectory": "",
	```

## Contributing

1. Fork it
2. Create your feature or fix branch (`git checkout -b feat/fooBar`)
3. Commit your changes (`git commit -am 'feat: add some fooBar'`)
4. Push to the branch (`git push origin feat/fooBar`)
5. Create a new Pull Request

## License

Dual-licensed under the terms of both the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0) ([LICENSE-APACHE](LICENSE-APACHE)) and the [MIT license](https://opensource.org/licenses/MIT) ([LICENSE-MIT](LICENSE-MIT)) at your option.

