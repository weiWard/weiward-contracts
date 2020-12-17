module.exports =  {
	semi:  true,
	trailingComma:  'all',
	singleQuote:  true,
	printWidth:  79,
	tabWidth:  2,
	useTabs: true,
	bracketSpacing: true,
	overrides: [
		{
			files: '*.sol',
			options: {
				singleQuote: false,
			},
		},
	],
};
