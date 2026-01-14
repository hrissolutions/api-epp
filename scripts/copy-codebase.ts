#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";

interface CopyOptions {
	sourceDir: string;
	targetDir: string;
	excludeFiles: string[];
	excludeDirs: string[];
}

class CodebaseCopier {
	private options: CopyOptions;

	constructor(options: CopyOptions) {
		this.options = options;
	}

	/**
	 * Copy the entire codebase excluding specified files and directories
	 */
	public async copyCodebase(): Promise<void> {
		try {
			// Force output to be displayed immediately
			process.stdout.write("🚀 Starting codebase copy...\n");
			process.stdout.write(`📁 Source: ${this.options.sourceDir}\n`);
			process.stdout.write(`📁 Target: ${this.options.targetDir}\n`);
			process.stdout.write(`🚫 Excluding files: ${this.options.excludeFiles.join(", ")}\n`);
			process.stdout.write(
				`🚫 Excluding directories: ${this.options.excludeDirs.join(", ")}\n`,
			);

			// Create target directory if it doesn't exist
			if (!fs.existsSync(this.options.targetDir)) {
				fs.mkdirSync(this.options.targetDir, { recursive: true });
				process.stdout.write(`✅ Created target directory: ${this.options.targetDir}\n`);
			}

			await this.copyDirectory(this.options.sourceDir, this.options.targetDir);

			// Merge package.json files
			await this.mergePackageJson();

			process.stdout.write("✅ Codebase copy completed successfully!\n");
		} catch (error) {
			console.error("❌ Error copying codebase:", error);
			process.exit(1);
		}
	}

	/**
	 * Merge package.json files
	 */
	private async mergePackageJson(): Promise<void> {
		const sourcePackagePath = path.join(this.options.sourceDir, "package.json");
		const targetPackagePath = path.join(this.options.targetDir, "package.json");

		// Check if both package.json files exist
		if (!fs.existsSync(sourcePackagePath)) {
			process.stdout.write("⚠️  Source package.json not found, skipping merge\n");
			return;
		}

		if (!fs.existsSync(targetPackagePath)) {
			process.stdout.write("⚠️  Target package.json not found, skipping merge\n");
			return;
		}

		try {
			// Read both package.json files
			const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));
			const targetPackage = JSON.parse(fs.readFileSync(targetPackagePath, "utf8"));

			// Merge the packages
			const mergedPackage = {
				...targetPackage, // Start with target package (user's existing package.json)
				...sourcePackage, // Override with source package (template package.json)
				// Preserve user's specific fields
				name: targetPackage.name || sourcePackage.name,
				version: targetPackage.version || "1.0.0",
				description: targetPackage.description || sourcePackage.description,
				// Merge dependencies
				dependencies: {
					...sourcePackage.dependencies,
					...targetPackage.dependencies,
				},
				// Merge devDependencies
				devDependencies: {
					...sourcePackage.devDependencies,
					...targetPackage.devDependencies,
				},
				// Merge scripts
				scripts: {
					...sourcePackage.scripts,
					...targetPackage.scripts,
				},
			};

			// Remove npm-package specific fields from the generated codebase
			this.sanitizeForAppCodebase(mergedPackage);

			// Write merged package.json
			fs.writeFileSync(targetPackagePath, JSON.stringify(mergedPackage, null, 2));
			process.stdout.write("📦 Merged package.json files successfully\n");
		} catch (error) {
			process.stdout.write(`⚠️  Error merging package.json: ${error}\n`);
		}
	}

	/**
	 * Remove fields/scripts that are only relevant when this repo is used as an npm package
	 */
	private sanitizeForAppCodebase(pkg: Record<string, any>): void {
		// Top-level fields to drop
		const fieldsToRemove = ["exports", "bin", "files", "publishConfig", "types", "module"];

		for (const key of fieldsToRemove) {
			if (key in pkg) delete pkg[key];
		}

		// Remove package-publishing related scripts and internal CLI entries if present
		if (pkg.scripts && typeof pkg.scripts === "object") {
			const scriptsToRemove = [
				"build:lib",
				"build:lib:cjs",
				"build:lib:esm",
				"build:lib:types",
				"build:scripts",
				"publish",
				"postpublish",
				"msa-generate",
				"msa-docs",
				"msa-generate-codebase",
				"msi",
				"add-service",
				"generate-service",
				"mta-generate",
			];

			for (const key of scriptsToRemove) {
				if (key in pkg.scripts) delete pkg.scripts[key];
			}
		}
	}

	/**
	 * Recursively copy directory contents
	 */
	private async copyDirectory(sourcePath: string, targetPath: string): Promise<void> {
		const items = fs.readdirSync(sourcePath);

		for (const item of items) {
			const sourceItemPath = path.join(sourcePath, item);
			const targetItemPath = path.join(targetPath, item);
			const stat = fs.statSync(sourceItemPath);

			// Compute relative segments to allow excluding nested directories anywhere in the path
			const relativeFromRoot = path.relative(this.options.sourceDir, sourceItemPath);
			const pathSegments = relativeFromRoot.split(path.sep).filter(Boolean);
			if (pathSegments.some((seg) => this.options.excludeDirs.includes(seg))) {
				console.log(
					`⏭️  Skipping path (excluded directory in ancestry): ${relativeFromRoot}`,
				);
				continue;
			}

			// Skip excluded files
			if (stat.isFile() && this.options.excludeFiles.includes(item)) {
				console.log(`⏭️  Skipping file: ${item}`);
				continue;
			}

			// Skip excluded directories
			if (stat.isDirectory() && this.options.excludeDirs.includes(item)) {
				console.log(`⏭️  Skipping directory: ${item}`);
				continue;
			}

			// Skip all .js files inside the scripts directory except index.js
			const isInsideScriptsDir = pathSegments.includes("scripts");
			if (
				stat.isFile() &&
				isInsideScriptsDir &&
				path.extname(item) === ".js" &&
				item !== "index.js"
			) {
				console.log(`⏭️  Skipping file in scripts: ${item}`);
				continue;
			}

			if (stat.isDirectory()) {
				// Create target directory
				if (!fs.existsSync(targetItemPath)) {
					fs.mkdirSync(targetItemPath, { recursive: true });
				}

				// Recursively copy directory contents
				await this.copyDirectory(sourceItemPath, targetItemPath);
				console.log(`📁 Copied directory: ${item}`);
			} else {
				// Copy file
				fs.copyFileSync(sourceItemPath, targetItemPath);
				console.log(`📄 Copied file: ${item}`);
			}
		}
	}
}

// Main execution
async function main() {
	const args = process.argv.slice(2);

	// Default target directory is current directory
	let targetDir = "./";

	// Check if target directory is provided as argument
	if (args.length > 0) {
		targetDir = args[0];
	}

	// Get the package root directory (where the package is installed)
	// When installed via npm, the structure is: node_modules/msa-template-1bis/
	// When running locally, the structure is: dist/scripts/
	let packageRoot: string;

	if (__dirname.includes("node_modules")) {
		// Running from installed package
		// Go up from dist/scripts to the package root (need to go up 3 levels)
		packageRoot = path.resolve(__dirname, "../..");
	} else {
		// Running from local development
		packageRoot = path.resolve(__dirname, "../..");
	}

	// Debug: Log the paths
	process.stdout.write(`🔍 Debug: __dirname = ${__dirname}\n`);
	process.stdout.write(`🔍 Debug: packageRoot = ${packageRoot}\n`);
	process.stdout.write(`🔍 Debug: targetDir = ${path.resolve(targetDir)}\n`);

	// Check if source directory exists
	if (!fs.existsSync(packageRoot)) {
		process.stdout.write(`❌ Error: Source directory does not exist: ${packageRoot}\n`);
		process.exit(1);
	}

	const options: CopyOptions = {
		sourceDir: packageRoot,
		targetDir: path.resolve(targetDir),
		excludeFiles: [
			"msa-docs.js",
			"msa-generate.js",
			"msi-generate.js",
			"mta.js",
			"add-service.js",
			"add-service.ts",
			"rename-esm.js",
			"lib-entry.ts",
			".npmignore",
		],
		excludeDirs: ["templates", "node_modules", "dist", "logs", ".git", "lib"],
	};

	const copier = new CodebaseCopier(options);
	await copier.copyCodebase();
}

// Run if this file is executed directly
if (require.main === module) {
	main().catch(console.error);
}

export { CodebaseCopier, CopyOptions };
