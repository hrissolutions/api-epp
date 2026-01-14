const eslintConfigPrettier = require("eslint-config-prettier");
const parser = require("@typescript-eslint/parser");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = [
	eslintConfigPrettier,
	{
		files: ["app/**/*.ts", "index.ts"],
		languageOptions: {
			parserOptions: {
				ecmaVersion: 2018,
				sourceType: "module",
			},
			parser: parser,
		},
		ignores: [],
	},
	eslintPluginPrettierRecommended,
];
