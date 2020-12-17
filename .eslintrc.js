module.exports = {
	env: {
		es6: true,
		node: true, // server or library
		browser: true, // client app
		mocha: true,
	},
	extends: [
		'plugin:@typescript-eslint/recommended',
		'prettier/@typescript-eslint', // breaks with global cache
		'plugin:prettier/recommended',
	],
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint', 'prettier', 'mocha'],
	parserOptions: {
		ecmaVersion: 2019,
		sourceType: 'module',
		ecmaFeatures: {
			jsx: true,
		},
	},
	rules: {
		// indent: ["error", "tab"],
		'linebreak-style': ['error', 'unix'],
		// quotes: ["error", "single"],
		'no-console': 'warn',
		'no-unused-vars': 'off',
		'@typescript-eslint/no-unused-vars': [
			'error',
			{
				vars: 'all',
				args: 'after-used',
				ignoreRestSiblings: false,
				varsIgnorePattern: '^h$',
			},
		],
		'@typescript-eslint/explicit-function-return-type': 'warn', // Consider using explicit annotations for object literals and function return types even when they can be inferred.
		'no-empty': 'warn',
		'new-cap': ['warn', { capIsNewExceptions: ['Some', 'None', 'Ok', 'Err'] }],
	},
	settings: {
		react: {
			version: 'latest', // Assume latest since we're not even using react
		},
		'import/resolver': {
			node: {
				extensions: ['.js', '.jsx', '.ts', '.tsx'],
			},
		},
	},
};
