import { spawnSync } from "child_process";

function run(command: string, args: string[], options: { stdio?: any } = {}) {
	const result = spawnSync(command, args, {
		stdio: "inherit",
		shell: process.platform === "win32",
		...options,
	});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

// Collect args for generate-service. Support both positional and npm config flags.
let userArgs = process.argv.slice(2);
const npmFrom = process.env.npm_config_from;
const npmTo = process.env.npm_config_to;

if (userArgs.length === 0 && (npmFrom || npmTo)) {
	const derived: string[] = [];
	if (npmFrom) derived.push("--from", npmFrom);
	if (npmTo) derived.push("--to", npmTo);
	userArgs = derived;
}

// 1) Run generate-service with user's args
run("ts-node", ["scripts/generate-service.ts", ...userArgs]);

// 2) Then run export-docs WITHOUT forwarding previous args
run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "export-docs"]);
