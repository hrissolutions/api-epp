const path = require("path");

module.exports = {
	entry: "./index.ts",
	target: "node",
	externals: [
		/^[a-z\-0-9]+$/, // Ignore node_modules folder
	],
	output: {
		filename: "server.ts", // output file
		path: path.join(__dirname, "dist"),
		libraryTarget: "commonjs",
	},
	resolve: {
		// Add in `.ts` and `.tsx` as a resolvable extension.
		extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js", ".json", ".yaml"],
		modules: ["./node_modules", "node_modules"],
	},
	resolveLoader: {
		//root: [`${root}/node_modules`],
	},
	module: {
		rules: [
			{
				// all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
				test: /\.tsx?$/,
				use: [
					{
						loader: "ts-loader",
					},
				],
			},
		],
	},
};
