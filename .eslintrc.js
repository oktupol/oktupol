module.exports = {
	env: {
		es6: true,
		node: true,
	},
	extends: ['standard', 'prettier'],
	globals: {
		Atomics: 'readonly',
		SharedArrayBuffer: 'readonly',
	},
	parserOptions: {
		ecmaVersion: 2018,
		sourceType: 'module',
	},
	plugins: ['prettier'],
	rules: {
		'end-of-line': 1,
		'no-unused-vars': 'off',
		'no-useless-constructor': 'off',
		'prettier/prettier': 'error',
	},
};
