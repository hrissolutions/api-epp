import fs from "fs";
import path from "path";

const rootDir = path.resolve(__dirname, "../..");
const appDir = path.join(process.cwd(), "app");
const testsDir = path.join(process.cwd(), "tests");
const constantsFile = path.join(process.cwd(), "config", "constant.ts");
const zodDir = path.join(process.cwd(), "zod");
const prismaSchemaDir = path.join(process.cwd(), "prisma", "schema");
const prismaSeedsDir = path.join(process.cwd(), "prisma", "seeds");
const indexFile = path.join(process.cwd(), "index.ts");
// Use existing template files from their current locations instead of a separate templates directory
// But only if they actually contain template files, otherwise use package templates
const templateAppDir = path.join(process.cwd(), "app", "template");
const templateZodDir = path.join(process.cwd(), "zod");
const templateSchemaDir = path.join(process.cwd(), "prisma", "schema");
const templateTestsDir = path.join(process.cwd(), "tests");

// Fallback to npm package templates if local templates don't exist
// Find the package root by looking for the templates directory in node_modules
function findPackageTemplatesDir(): string {
	// Try to find the package in node_modules
	const possiblePaths = [
		path.join(process.cwd(), "node_modules", "msa-template-1bis", "templates"),
		path.join(__dirname, "..", "..", "..", "msa-template-1bis", "templates"),
		path.join(__dirname, "..", "templates"), // For development
		// Additional fallback paths
		path.join(process.cwd(), "node_modules", "msa-template-1bis", "templates", "template"),
		path.join(__dirname, "..", "..", "..", "..", "msa-template-1bis", "templates"),
	];

	for (const possiblePath of possiblePaths) {
		if (fs.existsSync(possiblePath)) {
			console.log(`✔ Found templates at: ${possiblePath}`);
			return possiblePath;
		}
	}

	// Fallback to relative path from script location
	const fallbackPath = path.join(__dirname, "..", "templates");
	console.log(`⚠ Using fallback template path: ${fallbackPath}`);
	return fallbackPath;
}

const packageTemplatesDir = findPackageTemplatesDir();
const packageTemplateAppDir = path.join(packageTemplatesDir, "template");
const packageTemplateZodDir = path.join(packageTemplatesDir, "template", "zod");
const packageTemplateSchemaDir = path.join(packageTemplatesDir, "template", "prisma", "schema");
const packageTemplateTestsDir = path.join(packageTemplatesDir, "template", "tests");

// Helper functions to get template directories with fallback
function getTemplateAppDir(): string {
	// Check if local template directory exists and has the required files
	if (fs.existsSync(templateAppDir)) {
		const requiredFiles = ["template.controller.ts", "template.router.ts", "index.ts"];
		const hasRequiredFiles = requiredFiles.every((file) =>
			fs.existsSync(path.join(templateAppDir, file)),
		);

		if (hasRequiredFiles) {
			console.log(`📁 Using local template directory: ${templateAppDir}`);
			return templateAppDir;
		} else {
			console.log(
				`⚠ Local template directory exists but is incomplete, using package templates`,
			);
		}
	}

	console.log(`📁 Using package template directory: ${packageTemplateAppDir}`);
	return packageTemplateAppDir;
}

function getTemplateZodDir(): string {
	// Check if local zod directory exists AND contains template files
	const localZodExists =
		fs.existsSync(templateZodDir) &&
		fs.existsSync(path.join(templateZodDir, "template.zod.ts"));
	return localZodExists ? templateZodDir : packageTemplateZodDir;
}

function getTemplateSchemaDir(): string {
	// Check if local schema directory exists AND contains template files
	const localSchemaExists =
		fs.existsSync(templateSchemaDir) &&
		fs.existsSync(path.join(templateSchemaDir, "template.prisma"));
	return localSchemaExists ? templateSchemaDir : packageTemplateSchemaDir;
}

function getTemplateTestsDir(): string {
	// Check if there's a test template in the templates directory first
	const templateTestFile = path.join(packageTemplateTestsDir, "template.controller.spec.ts");
	if (fs.existsSync(templateTestFile)) {
		return packageTemplateTestsDir;
	}
	// Fallback to local tests directory if it has the template file
	const localTemplateTestFile = path.join(templateTestsDir, "template.controller.spec.ts");
	if (fs.existsSync(localTemplateTestFile)) {
		return templateTestsDir;
	}
	// Default to package templates directory
	return packageTemplateTestsDir;
}

function toPascalCase(input: string): string {
	return input
		.replace(/[-_\s]+(.)?/g, (_: string, c: string) => (c ? c.toUpperCase() : ""))
		.replace(/^(.)/, (m) => m.toUpperCase());
}

function toCamelCase(input: string): string {
	const pascal = toPascalCase(input);
	return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function validateServiceName(input: string): string {
	// Validate that the service name only contains alphanumeric characters
	// No special characters like hyphens, underscores, spaces, etc.
	if (!/^[a-zA-Z0-9]+$/.test(input)) {
		throw new Error(
			`Invalid service name "${input}". Service names must contain only alphanumeric characters (letters and numbers). Special characters like hyphens (-), underscores (_), spaces, etc. are not allowed.`
		);
	}

	// Return the original input to preserve casing
	return input;
}

function replaceAllIdentifiers(content: string, name: string, source: string): string {
	const lower = name.toLowerCase();
	const pascal = toPascalCase(name);
	const camel = toCamelCase(name);
	const upper = name.toUpperCase();
	// remove plural handling to always map to singular identifiers

	const sourceLower = source.toLowerCase();
	const sourcePascal = toPascalCase(source);
	const sourceUpper = source.toUpperCase();

	// Helper function to preserve casing patterns
	function preserveCasing(text: string, sourceWord: string, targetWord: string): string {
		// If source is camelCase (like userProfile), preserve camelCase in target
		if (
			sourceWord !== sourceLower &&
			sourceWord !== sourcePascal &&
			sourceWord !== sourceUpper
		) {
			// Check if it's camelCase (starts with lowercase, has uppercase later)
			if (/^[a-z][a-zA-Z]*$/.test(sourceWord) && sourceWord !== sourceWord.toLowerCase()) {
				return toCamelCase(targetWord);
			}
			// Check if it's kebab-case (like user-profile)
			if (sourceWord.includes("-")) {
				return targetWord.toLowerCase().replace(/\s+/g, "-");
			}
			// Check if it's snake_case
			if (sourceWord.includes("_")) {
				return targetWord.toLowerCase().replace(/\s+/g, "_");
			}
		}
		return targetWord;
	}

	// Create target variants that preserve the original source casing patterns
	const targetPreserveCamel = preserveCasing(source, source, name);
	const targetPreserveKebab = source.includes("-")
		? name.toLowerCase().replace(/\s+/g, "-")
		: name;
	const targetPreserveSnake = source.includes("_")
		? name.toLowerCase().replace(/\s+/g, "_")
		: name;

	return (
		content
			// Handle kebab-case first (before word boundary replacements)
			.replace(new RegExp(`${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), name)
			.replace(
				new RegExp(
					`${source.replace(/-/g, "_").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
					"g",
				),
				name.replace(/-/g, "_"),
			)
			.replace(
				new RegExp(
					`${source.replace(/_/g, "-").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
					"g",
				),
				name.replace(/_/g, "-"),
			)
			// Preserve original casing patterns
			.replace(new RegExp(`\\b${source}\\b`, "g"), targetPreserveCamel)
			.replace(new RegExp(`\\b${source.replace(/-/g, "_")}\\b`, "g"), targetPreserveSnake)
			.replace(new RegExp(`\\b${source.replace(/_/g, "-")}\\b`, "g"), targetPreserveKebab)
			// Handle import statements - convert to lowercase for file names
			.replace(
				new RegExp(`from\\s+["']\\.\\/${source}\\b`, "g"),
				`from "./${name.toLowerCase()}`,
			)
			.replace(
				new RegExp(`from\\s+["']\\.\\/${sourcePascal}\\b`, "g"),
				`from "./${name.toLowerCase()}`,
			)
			.replace(
				new RegExp(`from\\s+["']\\.\\/${sourceLower}\\b`, "g"),
				`from "./${name.toLowerCase()}`,
			)
			// Handle import statements with different casing patterns
			.replace(
				new RegExp(`from\\s+["']\\.\\/${toCamelCase(source)}\\b`, "g"),
				`from "./${name.toLowerCase()}`,
			)
			.replace(
				new RegExp(`from\\s+["']\\.\\/${toPascalCase(source)}\\b`, "g"),
				`from "./${name.toLowerCase()}`,
			)
			// Handle specific import patterns for controller and router
			.replace(
				new RegExp(`from\\s+["']\\.\\/${toCamelCase(source)}\\.controller\\b`, "g"),
				`from "./${name.toLowerCase()}.controller`,
			)
			.replace(
				new RegExp(`from\\s+["']\\.\\/${toCamelCase(source)}\\.router\\b`, "g"),
				`from "./${name.toLowerCase()}.router`,
			)
			// Handle the case where source is already lowercase but gets converted to camelCase
			.replace(
				new RegExp(
					`from\\s+["']\\.\\/${toCamelCase(source.toLowerCase())}\\.controller\\b`,
					"g",
				),
				`from "./${name.toLowerCase()}.controller`,
			)
			.replace(
				new RegExp(
					`from\\s+["']\\.\\/${toCamelCase(source.toLowerCase())}\\.router\\b`,
					"g",
				),
				`from "./${name.toLowerCase()}.router`,
			)
			// Then handle standard cases
			.replace(new RegExp(`\\b${sourceUpper}\\b`, "g"), upper)
			.replace(new RegExp(`\\b${sourcePascal}\\b`, "g"), pascal)
			.replace(new RegExp(`\\b${sourceLower}\\b`, "g"), lower)
			// Fix constant naming - convert hyphens to underscores for constants
			.replace(new RegExp(`\\b${upper.replace(/-/g, "_")}\\b`, "g"), upper.replace(/-/g, "_"))
			// Common identifiers in code
			.replace(new RegExp(`${sourceLower}Module`, "g"), `${camel}Service`)
			.replace(new RegExp(`${sourcePascal}Schema`, "g"), `${pascal}Schema`)
			// Seeder function names
			.replace(new RegExp(`seed${sourcePascal}`, "g"), `seed${pascal}`)
			.replace(new RegExp(`seed${sourceLower}`, "g"), `seed${pascal}`)
			.replace(new RegExp(`${sourceLower}Data`, "g"), `${camel}Data`)
			// Fix pluralization in seeder function names
			.replace(new RegExp(`seed${pascal}s`, "g"), `seed${pascal}`)
			// Prisma model names should be lowercase
			.replace(new RegExp(`prisma\\.${pascal}`, "g"), `prisma.${lower}`)
			.replace(new RegExp(`prisma\\.${sourcePascal}`, "g"), `prisma.${lower}`)
			// Variable names in tests
			.replace(new RegExp(`${sourceLower}Controller`, "g"), `${camel}Controller`)
			.replace(new RegExp(`mock${sourcePascal}`, "g"), `mock${pascal}`)
			// Prisma types
			.replace(new RegExp(`${sourcePascal}FindManyArgs`, "g"), `${pascal}FindManyArgs`)
			.replace(new RegExp(`${sourcePascal}CountArgs`, "g"), `${pascal}CountArgs`)
			.replace(new RegExp(`${sourcePascal}FindFirstArgs`, "g"), `${pascal}FindFirstArgs`)
			.replace(new RegExp(`${sourcePascal}FindUniqueArgs`, "g"), `${pascal}FindUniqueArgs`)
			.replace(new RegExp(`${sourcePascal}CreateArgs`, "g"), `${pascal}CreateArgs`)
			.replace(new RegExp(`${sourcePascal}UpdateArgs`, "g"), `${pascal}UpdateArgs`)
			.replace(new RegExp(`${sourcePascal}DeleteArgs`, "g"), `${pascal}DeleteArgs`)
			// Route segments like source/source -> name/name
			.replace(new RegExp(`${sourceLower}/${sourceLower}`, "g"), `${lower}/${lower}`)
			// Activity/Audit log keys often used directly in code
			.replace(new RegExp(`CREATE_${sourceUpper}`, "g"), `CREATE_${upper}`)
			.replace(new RegExp(`GET_ALL_${sourceUpper}S`, "g"), `GET_ALL_${upper}`)
			.replace(new RegExp(`GET_ALL_${sourceUpper}`, "g"), `GET_ALL_${upper}`)
			.replace(new RegExp(`GET_${sourceUpper}`, "g"), `GET_${upper}`)
			.replace(new RegExp(`UPDATE_${sourceUpper}`, "g"), `UPDATE_${upper}`)
			.replace(new RegExp(`DELETE_${sourceUpper}`, "g"), `DELETE_${upper}`)
			.replace(new RegExp(`${sourceUpper}_CREATED`, "g"), `${upper}_CREATED`)
			.replace(new RegExp(`${sourceUpper}_UPDATED`, "g"), `${upper}_UPDATED`)
			.replace(new RegExp(`${sourceUpper}_DELETED`, "g"), `${upper}_DELETED`)
			.replace(new RegExp(`${sourceUpper}_RETRIEVED`, "g"), `${upper}_RETRIEVED`)
			.replace(new RegExp(`${sourceUpper}S_RETRIEVED`, "g"), `${upper}S_RETRIEVED`)
			// Activity/Audit log PAGE keys
			.replace(new RegExp(`${sourceUpper}_CREATION`, "g"), `${upper}_CREATION`)
			.replace(new RegExp(`${sourceUpper}_UPDATE`, "g"), `${upper}_UPDATE`)
			.replace(new RegExp(`${sourceUpper}_DELETION`, "g"), `${upper}_DELETION`)
			.replace(new RegExp(`${sourceUpper}_DETAILS`, "g"), `${upper}_DETAILS`)
			.replace(new RegExp(`${sourceUpper}_LIST`, "g"), `${upper}_LIST`)
			// Additional template-specific patterns
			.replace(new RegExp(`${sourceUpper}_GETTING_BY_ID`, "g"), `${upper}_GETTING_BY_ID`)
			.replace(new RegExp(`${sourceUpper}_ERROR_GETTING`, "g"), `${upper}_ERROR_GETTING`)
			.replace(new RegExp(`${sourceUpper}_ERROR_UPDATING`, "g"), `${upper}_ERROR_UPDATING`)
			.replace(
				new RegExp(`${sourceUpper}_ORDER_MUST_BE_ASC_OR_DESC`, "g"),
				`${upper}_ORDER_MUST_BE_ASC_OR_DESC`,
			)
			// Fix specific constant references that don't follow the pattern
			.replace(
				new RegExp(
					`config\\.ACTIVITY_LOG\\.${sourceUpper}\\.ACTIONS\\.CREATE_${sourceUpper}`,
					"g",
				),
				`config.ACTIVITY_LOG.${upper}.ACTIONS.CREATE_${upper}`,
			)
			.replace(
				new RegExp(
					`config\\.ACTIVITY_LOG\\.${sourceUpper}\\.DESCRIPTIONS\\.${sourceUpper}_CREATED`,
					"g",
				),
				`config.ACTIVITY_LOG.${upper}.DESCRIPTIONS.${upper}_CREATED`,
			)
			.replace(
				new RegExp(
					`config\\.ACTIVITY_LOG\\.${sourceUpper}\\.PAGES\\.${sourceUpper}_CREATION`,
					"g",
				),
				`config.ACTIVITY_LOG.${upper}.PAGES.${upper}_CREATION`,
			)
			.replace(
				new RegExp(`config\\.AUDIT_LOG\\.RESOURCES\\.${sourceUpper}`, "g"),
				`config.AUDIT_LOG.RESOURCES.${upper}`,
			)
			.replace(
				new RegExp(`config\\.AUDIT_LOG\\.ENTITY_TYPES\\.${sourceUpper}`, "g"),
				`config.AUDIT_LOG.ENTITY_TYPES.${upper}`,
			)
			.replace(
				new RegExp(
					`config\\.AUDIT_LOG\\.${sourceUpper}\\.DESCRIPTIONS\\.${sourceUpper}_CREATED`,
					"g",
				),
				`config.AUDIT_LOG.${upper}.DESCRIPTIONS.${upper}_CREATED`,
			)
			.replace(
				new RegExp(`config\\.SUCCESS\\.${sourceUpper}\\.CREATED`, "g"),
				`config.SUCCESS.${upper}.CREATED`,
			)
			.replace(
				new RegExp(`config\\.ERROR\\.${sourceUpper}\\.CREATE_FAILED`, "g"),
				`config.ERROR.${upper}.CREATE_FAILED`,
			)
			.replace(
				new RegExp(`config\\.ERROR\\.${sourceUpper}\\.NOT_FOUND`, "g"),
				`config.ERROR.${upper}.NOT_FOUND`,
			)
			.replace(
				new RegExp(`config\\.ERROR\\.${sourceUpper}\\.ERROR_GETTING`, "g"),
				`config.ERROR.${upper}.ERROR_GETTING`,
			)
			.replace(
				new RegExp(`config\\.ERROR\\.${sourceUpper}\\.ERROR_UPDATING`, "g"),
				`config.ERROR.${upper}.ERROR_UPDATING`,
			)
			.replace(
				new RegExp(`config\\.SUCCESS\\.${sourceUpper}\\.UPDATED`, "g"),
				`config.SUCCESS.${upper}.UPDATED`,
			)
			.replace(
				new RegExp(`config\\.SUCCESS\\.${sourceUpper}\\.DELETED`, "g"),
				`config.SUCCESS.${upper}.DELETED`,
			)
			.replace(
				new RegExp(`config\\.SUCCESS\\.${sourceUpper}\\.RETRIEVED`, "g"),
				`config.SUCCESS.${upper}.RETRIEVED`,
			)
			.replace(
				new RegExp(`config\\.SUCCESS\\.${sourceUpper}\\.RETRIEVED_ALL`, "g"),
				`config.SUCCESS.${upper}.RETRIEVED_ALL`,
			)
			.replace(
				new RegExp(`config\\.SUCCESS\\.${sourceUpper}\\.GETTING_BY_ID`, "g"),
				`config.SUCCESS.${upper}.GETTING_BY_ID`,
			)
			.replace(
				new RegExp(`config\\.ERROR\\.${sourceUpper}\\.GET_ALL_FAILED`, "g"),
				`config.ERROR.${upper}.GET_ALL_FAILED`,
			)
			.replace(
				new RegExp(`config\\.ERROR\\.${sourceUpper}\\.DELETE_FAILED`, "g"),
				`config.ERROR.${upper}.DELETE_FAILED`,
			)
			.replace(
				new RegExp(`config\\.ERROR\\.${sourceUpper}\\.UPDATE_FAILED`, "g"),
				`config.ERROR.${upper}.UPDATE_FAILED`,
			)
			// Fix Prisma type references
			.replace(
				new RegExp(`Prisma\\.${sourcePascal}WhereInput`, "g"),
				`Prisma.${pascal}WhereInput`,
			)
			.replace(
				new RegExp(`Prisma\\.${sourcePascal}CreateInput`, "g"),
				`Prisma.${pascal}CreateInput`,
			)
			.replace(
				new RegExp(`Prisma\\.${sourcePascal}UpdateInput`, "g"),
				`Prisma.${pascal}UpdateInput`,
			)
			.replace(
				new RegExp(`Prisma\\.${sourcePascal}OrderByWithRelationInput`, "g"),
				`Prisma.${pascal}OrderByWithRelationInput`,
			)
			.replace(
				new RegExp(`Prisma\\.${sourcePascal}WhereUniqueInput`, "g"),
				`Prisma.${pascal}WhereUniqueInput`,
			)
			// Fix variable names that contain template
			.replace(new RegExp(`existing${sourcePascal}`, "g"), `existing${pascal}`)
			.replace(new RegExp(`updated${sourcePascal}`, "g"), `updated${pascal}`)
			.replace(new RegExp(`new${sourcePascal}`, "g"), `new${pascal}`)
			.replace(new RegExp(`${sourceLower}Data`, "g"), `${lower}Data`)
			.replace(new RegExp(`${sourceLower}Id`, "g"), `${lower}Id`)
			.replace(new RegExp(`${sourceLower}List`, "g"), `${lower}List`)
			.replace(new RegExp(`${sourceLower}Count`, "g"), `${lower}Count`)
			.replace(new RegExp(`${sourceLower}Query`, "g"), `${lower}Query`)
			.replace(new RegExp(`${sourceLower}Filter`, "g"), `${lower}Filter`)
			.replace(new RegExp(`${sourceLower}Order`, "g"), `${lower}Order`)
			.replace(new RegExp(`${sourceLower}Fields`, "g"), `${lower}Fields`)
			.replace(new RegExp(`${sourceLower}Where`, "g"), `${lower}Where`)
			.replace(new RegExp(`${sourceLower}Select`, "g"), `${lower}Select`)
			.replace(new RegExp(`${sourceLower}Include`, "g"), `${lower}Include`)
			.replace(new RegExp(`${sourceLower}OrderBy`, "g"), `${lower}OrderBy`)
			.replace(new RegExp(`${sourceLower}Take`, "g"), `${lower}Take`)
			.replace(new RegExp(`${sourceLower}Skip`, "g"), `${lower}Skip`)
			.replace(new RegExp(`${sourceLower}Cursor`, "g"), `${lower}Cursor`)
			.replace(new RegExp(`${sourceLower}Distinct`, "g"), `${lower}Distinct`)
			.replace(new RegExp(`${sourceLower}GroupBy`, "g"), `${lower}GroupBy`)
			.replace(new RegExp(`${sourceLower}Having`, "g"), `${lower}Having`)
			.replace(new RegExp(`${sourceLower}Aggregate`, "g"), `${lower}Aggregate`)
			.replace(new RegExp(`${sourceLower}Count`, "g"), `${lower}Count`)
			.replace(new RegExp(`${sourceLower}Avg`, "g"), `${lower}Avg`)
			.replace(new RegExp(`${sourceLower}Sum`, "g"), `${lower}Sum`)
			.replace(new RegExp(`${sourceLower}Min`, "g"), `${lower}Min`)
			.replace(new RegExp(`${sourceLower}Max`, "g"), `${lower}Max`)
			// Final fix for import statements - use the correct casing for file names
			.replace(
				new RegExp(`from\\s+["']\\.\\/${toCamelCase(name)}\\.controller\\b`, "g"),
				`from "./${toCamelCase(name)}.controller`,
			)
			.replace(
				new RegExp(`from\\s+["']\\.\\/${toCamelCase(name)}\\.router\\b`, "g"),
				`from "./${toCamelCase(name)}.router`,
			)
			// Handle kebab-case imports (booking-app -> booking-app)
			.replace(
				new RegExp(`from\\s+["']\\.\\/${name}\\.controller\\b`, "g"),
				`from "./${name}.controller`,
			)
			.replace(
				new RegExp(`from\\s+["']\\.\\/${name}\\.router\\b`, "g"),
				`from "./${name}.router`,
			)
	);
}

function copyAndTransform(src: string, dest: string, name: string, source: string) {
	console.log(`📁 Copying from: ${src} to: ${dest}`);
	const stats = fs.statSync(src);
	if (stats.isDirectory()) {
		if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
		const entries = fs.readdirSync(src);
		console.log(`📁 Found ${entries.length} entries in source directory:`, entries);
		for (const entry of entries) {
			const srcPath = path.join(src, entry);
			const entryStats = fs.statSync(srcPath);

			// Skip subdirectories when copying app template - they should be handled by specific functions
			if (entryStats.isDirectory()) {
				console.log(`⏭️ Skipping directory: ${entry} (handled by specific functions)`);
				continue;
			}

			// Helper function to preserve casing in file names
			function preserveFileNameCasing(
				fileName: string,
				sourceWord: string,
				targetWord: string,
			): string {
				// Check if it's camelCase (like userProfile)
				if (
					/^[a-z][a-zA-Z]*$/.test(sourceWord) &&
					sourceWord !== sourceWord.toLowerCase()
				) {
					return fileName.replace(new RegExp(sourceWord, "g"), toCamelCase(targetWord));
				}
				// Check if target is kebab-case (like booking-app) - retain hyphens for file names
				if (targetWord.includes("-")) {
					return fileName.replace(new RegExp(sourceWord, "g"), targetWord);
				}
				// Check if it's kebab-case source
				if (sourceWord.includes("-")) {
					return fileName.replace(new RegExp(sourceWord, "g"), targetWord);
				}
				// Check if it's snake_case
				if (sourceWord.includes("_")) {
					return fileName.replace(
						new RegExp(sourceWord, "g"),
						targetWord.toLowerCase().replace(/\s+/g, "_"),
					);
				}
				// For other cases, preserve the original casing pattern of the target
				return fileName.replace(new RegExp(sourceWord, "g"), targetWord);
			}

			let renamed = preserveFileNameCasing(entry, source, name);
			// Additional handling for kebab-case targets
			if (name.includes("-")) {
				renamed = renamed.replace(new RegExp(toPascalCase(source), "g"), name);
			} else {
				renamed = renamed.replace(
					new RegExp(toPascalCase(source), "g"),
					toPascalCase(name),
				);
			}
			const destPath = path.join(dest, renamed);
			copyAndTransform(srcPath, destPath, name, source);
		}
	} else {
		console.log(`📄 Copying file: ${src} -> ${dest}`);
		const buffer = fs.readFileSync(src, "utf8");
		const transformed = replaceAllIdentifiers(buffer, name, source);
		fs.writeFileSync(dest, transformed, "utf8");
		console.log(`✅ Successfully copied: ${path.basename(dest)}`);
	}
}

function pluralizeLower(word: string): string {
	const lower = word.toLowerCase();
	if (lower.endsWith("s")) return lower;
	return `${lower}s`;
}

function updateConstantsForService(name: string) {
	if (!fs.existsSync(constantsFile)) return;
	let content = fs.readFileSync(constantsFile, "utf8");

	const UPPER = name.toUpperCase().replace(/-/g, "_"); // Convert hyphens to underscores for constants
	const Pascal = toPascalCase(name);
	const lower = name.toLowerCase();
	const pluralLower = pluralizeLower(name);

	// Check if ERROR section already has this service
	if (new RegExp(`ERROR:\\s*\\{[\\s\\S]*?\\n\\t\\t${UPPER}\\s*:`).test(content)) {
		console.log(`⚠ Constants for ${name} already exist, skipping`);
		return;
	}

	// Add to ERROR section - match the exact structure from your constants
	if (content.includes("ERROR:")) {
		content = content.replace(/(ERROR:\s*\{[\s\S]*?)(\n\t\},)/, (_m, p1, p2) => {
			if (p1.includes(`${UPPER}:`)) return _m; // Already exists
			const block = `\n\t\t${UPPER}: {\n\t\t\tVALIDATION_FAILED: "${Pascal} validation failed",\n\t\t\tINVALID_ID_FORMAT: "Invalid ${lower} ID format",\n\t\t\tNOT_FOUND: "${Pascal} not found",\n\t\t\tCREATE_FAILED: "Error creating ${lower}",\n\t\t\tUPDATE_FAILED: "Error updating ${lower}",\n\t\t\tDELETE_FAILED: "Error deleting ${lower}",\n\t\t\tGET_FAILED: "Error getting ${lower}",\n\t\t\tGET_ALL_FAILED: "Error getting ${pluralLower}",\n\t\t\tERROR_GETTING: "Error getting ${lower}",\n\t\t\tERROR_UPDATING: "Error updating ${lower}",\n\t\t\tORDER_MUST_BE_ASC_OR_DESC: "Order must be asc or desc",\n\t\t},`;
			return p1 + block + p2;
		});
	}

	// Add to SUCCESS section - match the exact structure
	if (content.includes("SUCCESS:")) {
		if (!new RegExp(`SUCCESS:\\s*\\{[\\s\\S]*?\\n\\t\\t${UPPER}\\s*:`).test(content)) {
			content = content.replace(/(SUCCESS:\s*\{)([\s\S]*?)(\n\t\},)/, (_m, p1, p2, p3) => {
				const block = `\n\t\t${UPPER}: {\n\t\t\tCREATED: "${Pascal} created successfully",\n\t\t\tUPDATED: "${Pascal} updated successfully",\n\t\t\tDELETED: "${Pascal} deleted successfully",\n\t\t\tRETRIEVED: "${Pascal} retrieved successfully",\n\t\t\tRETRIEVED_ALL: "${Pascal}s retrieved successfully",\n\t\t\tGETTING_BY_ID: "Getting ${lower} by ID",\n\t\t},`;
				return p1 + p2 + block + p3;
			});
		}
	}

	// Add to existing ACTIVITY_LOG section - match your structure
	if (content.includes("ACTIVITY_LOG:")) {
		if (!new RegExp(`ACTIVITY_LOG:\\s*\\{[\\s\\S]*?\\b${UPPER}\\s*:`).test(content)) {
			const activityGroup = `\n\t\t${UPPER}: {\n\t\t\tACTIONS: {\n\t\t\t\tCREATE_${UPPER}: "CREATE_${UPPER}",\n\t\t\t\tGET_ALL_${UPPER}: "GET_ALL_${UPPER}",\n\t\t\t\tGET_${UPPER}: "GET_${UPPER}",\n\t\t\t\tUPDATE_${UPPER}: "UPDATE_${UPPER}",\n\t\t\t\tDELETE_${UPPER}: "DELETE_${UPPER}",\n\t\t\t},\n\t\t\tDESCRIPTIONS: {\n\t\t\t\t${UPPER}_CREATED: "Created new ${lower}",\n\t\t\t\t${UPPER}_UPDATED: "Updated ${lower}",\n\t\t\t\t${UPPER}_DELETED: "Deleted ${lower}",\n\t\t\t\t${UPPER}_RETRIEVED: "Retrieved ${lower} details",\n\t\t\t\t${UPPER}S_RETRIEVED: "Retrieved ${lower} list",\n\t\t\t},\n\t\t\tPAGES: {\n\t\t\t\t${UPPER}_CREATION: "${Pascal} Creation",\n\t\t\t\t${UPPER}_UPDATE: "${Pascal} Update",\n\t\t\t\t${UPPER}_DELETION: "${Pascal} Deletion",\n\t\t\t\t${UPPER}_DETAILS: "${Pascal} Details",\n\t\t\t\t${UPPER}_LIST: "${Pascal} List",\n\t\t\t},\n\t\t},`;
			// Insert at the beginning of ACTIVITY_LOG, after the opening brace
			content = content.replace(/(ACTIVITY_LOG:\s*\{)/, `$1${activityGroup}`);
		}
	}

	// Add to existing AUDIT_LOG sections - match your structure
	if (content.includes("AUDIT_LOG:")) {
		// Add to AUDIT_LOG.RESOURCES section
		if (content.includes("RESOURCES:")) {
			content = content.replace(
				/(RESOURCES:\s*\{[\s\S]*?)(\n\t\t\},)/,
				(_m, p1, p2) => {
					if (p1.includes(`${UPPER}: "${lower}"`)) return _m; // Already exists
					const block = `\n\t\t\t${UPPER}: "${lower}",`;
					return p1 + block + p2;
				},
			);
		}

		// Add to AUDIT_LOG.ENTITY_TYPES section
		if (content.includes("ENTITY_TYPES:")) {
			content = content.replace(
				/(ENTITY_TYPES:\s*\{[\s\S]*?)(\n\t\t\},)/,
				(_m, p1, p2) => {
					if (p1.includes(`${UPPER}: "${lower}"`)) return _m; // Already exists
					const block = `\n\t\t\t${UPPER}: "${lower}",`;
					return p1 + block + p2;
				},
			);
		}

		// Add resource-specific AUDIT_LOG section (config.AUDIT_LOG.SERVICENAME.DESCRIPTIONS.SERVICENAME_CREATED)
		if (!new RegExp(`AUDIT_LOG:[\\s\\S]*?\\n\\t\\t${UPPER}\\s*:`).test(content)) {
			const auditGroup = `\t\t${UPPER}: {\n\t\t\tDESCRIPTIONS: {\n\t\t\t\t${UPPER}_CREATED: "Created new ${lower}",\n\t\t\t\t${UPPER}_UPDATED: "Updated ${lower}",\n\t\t\t\t${UPPER}_DELETED: "Deleted ${lower}",\n\t\t\t},\n\t\t},\n`;

			console.log(`🔍 Looking for AUDIT_LOG section to add ${UPPER} service...`);

			// Simple and reliable approach: find the TEMPLATE section within AUDIT_LOG and insert before it
			const templatePattern = /(\n\s*TEMPLATE:\s*\{\s*\n\s*DESCRIPTIONS:\s*\{[\s\S]*?\n\s*\},\s*\n\s*\},\s*\n\s*\},)/;

			if (templatePattern.test(content)) {
				console.log(`✅ Found TEMPLATE section, inserting ${UPPER} before it`);
				content = content.replace(templatePattern, `\n${auditGroup}$1`);
			} else {
				console.log(`⚠ TEMPLATE section pattern not found, trying fallback...`);
				// Fallback: insert before the closing of AUDIT_LOG
				const auditLogEndPattern = /(\n\s*\},\s*\n\s*AUTH_CONFIG:)/;
				if (auditLogEndPattern.test(content)) {
					console.log(`✅ Found AUDIT_LOG end, inserting ${UPPER} there`);
					content = content.replace(auditLogEndPattern, `\n${auditGroup}$1`);
				} else {
					console.log(`❌ Could not find insertion point for ${UPPER} in AUDIT_LOG`);
				}
			}
		}
	}

	// Normalize any accidental double 'S' in GET_ALL_* action keys/values
	content = content.replace(/\bGET_ALL_([A-Z0-9]+)SS\b/g, "GET_ALL_$1S");

	fs.writeFileSync(constantsFile, content, "utf8");
	console.log(`✅ Added constants for ${name} service`);
}

function scaffoldZodForService(name: string, source: string) {
	if (!fs.existsSync(zodDir)) {
		console.log(`⚠ Zod directory not found, skipping Zod schema generation`);
		return;
	}
	const lower = name.toLowerCase();
	const pascal = toPascalCase(name);
	const sourceZodFile = path.join(getTemplateZodDir(), `${source.toLowerCase()}.zod.ts`);
	const targetZodFile = path.join(zodDir, `${name}.zod.ts`);
	if (!fs.existsSync(sourceZodFile)) {
		console.log(
			`⚠ Zod template not found at ${sourceZodFile}, skipping Zod schema generation`,
		);
		return;
	}
	if (fs.existsSync(targetZodFile)) {
		console.log(`⚠ Zod schema for ${name} already exists, skipping`);
		return;
	}
	const content = fs.readFileSync(sourceZodFile, "utf8");
	const replaced = replaceAllIdentifiers(content, name, source);
	fs.writeFileSync(targetZodFile, replaced, "utf8");
	console.log(`✅ Created Zod schema: ${targetZodFile}`);
}

function scaffoldPrismaForService(name: string, source: string) {
	if (!fs.existsSync(prismaSchemaDir)) {
		console.log(`⚠ Prisma schema directory not found, skipping Prisma schema generation`);
		return;
	}
	const sourcePrismaFile = path.join(getTemplateSchemaDir(), `${source.toLowerCase()}.prisma`);
	const targetPrismaFile = path.join(prismaSchemaDir, `${name}.prisma`);
	if (!fs.existsSync(sourcePrismaFile)) {
		console.log(
			`⚠ Prisma template not found at ${sourcePrismaFile}, skipping Prisma schema generation`,
		);
		return;
	}
	if (fs.existsSync(targetPrismaFile)) {
		console.log(`⚠ Prisma schema for ${name} already exists, skipping`);
		return;
	}
	const content = fs.readFileSync(sourcePrismaFile, "utf8");
	const replaced = replaceAllIdentifiers(content, name, source);
	fs.writeFileSync(targetPrismaFile, replaced, "utf8");
	console.log(`✅ Created Prisma schema: ${targetPrismaFile}`);
}

function scaffoldSeederForService(name: string, source: string) {
	if (!fs.existsSync(prismaSeedsDir)) {
		console.log(`⚠ Prisma seeds directory not found, skipping seeder generation`);
		return;
	}
	const sourceSeederFile = path.join(prismaSeedsDir, `${source.toLowerCase()}Seeder.ts`);
	const targetSeederFile = path.join(prismaSeedsDir, `${name.toLowerCase()}Seeder.ts`);
	if (!fs.existsSync(sourceSeederFile)) {
		console.log(
			`⚠ Seeder template not found at ${sourceSeederFile}, skipping seeder generation`,
		);
		return;
	}
	if (fs.existsSync(targetSeederFile)) {
		console.log(`⚠ Seeder for ${name} already exists, skipping`);
		return;
	}
	const content = fs.readFileSync(sourceSeederFile, "utf8");
	const replaced = replaceAllIdentifiers(content, name, source);
	fs.writeFileSync(targetSeederFile, replaced, "utf8");
	console.log(`✅ Created seeder file: ${targetSeederFile}`);
}

function updateSeedFile(name: string) {
	const seedFile = path.join(rootDir, "prisma", "seed.ts");
	if (!fs.existsSync(seedFile)) return;

	let content = fs.readFileSync(seedFile, "utf8");
	const lower = name.toLowerCase();
	const pascal = toPascalCase(name);

	// Skip if already added
	if (content.includes(`seed${pascal}`)) {
		console.log(`⚠ Seeder for ${name} already exists in seed.ts, skipping`);
		return;
	}

	// Add import statement
	const importLine = `import { seed${pascal} } from "./seeds/${lower}Seeder";`;

	// Find the last import statement and add after it
	const importRegex = /import\s+.*?from\s+["'][^"']*["'];?\s*$/gm;
	let lastImport: RegExpExecArray | null = null;
	let match: RegExpExecArray | null;
	while ((match = importRegex.exec(content)) !== null) {
		lastImport = match;
	}

	if (lastImport) {
		const insertPos = lastImport.index + lastImport[0].length;
		content = content.slice(0, insertPos) + "\n" + importLine + content.slice(insertPos);
	} else {
		// If no imports found, add after the first line
		const firstLineEnd = content.indexOf("\n");
		if (firstLineEnd !== -1) {
			content =
				content.slice(0, firstLineEnd + 1) +
				importLine +
				"\n" +
				content.slice(firstLineEnd + 1);
		} else {
			content = importLine + "\n" + content;
		}
	}

	// Add seeder call in main function
	const seederCall = `\t// Seed ${lower} data\n\tawait seed${pascal}();`;

	// Find the main function and add the seeder call before the final console.log
	const mainFunctionRegex = /async function main\(\)\s*\{([\s\S]*?)\n\}/;
	const mainMatch = content.match(mainFunctionRegex);

	if (mainMatch) {
		const mainContent = mainMatch[1];
		// Check if seeder call already exists
		if (!mainContent.includes(`seed${pascal}`)) {
			// Add before the final console.log
			const updatedMainContent = mainContent.replace(
				/(\s*console\.log\("Seeding completed successfully!"\);)/,
				`${seederCall}\n$1`,
			);
			content = content.replace(
				mainFunctionRegex,
				`async function main() {${updatedMainContent}\n}`,
			);
		}
	} else {
		// Fallback: add before the closing brace of main function
		content = content.replace(
			/(\s*console\.log\("Seeding completed successfully!"\);)/,
			`${seederCall}\n$1`,
		);
	}

	fs.writeFileSync(seedFile, content, "utf8");
	console.log(`✔ Added ${name} seeder to prisma/seed.ts`);
}

function updateIndexFile(name: string) {
	if (!fs.existsSync(indexFile)) return;

	let content = fs.readFileSync(indexFile, "utf8");
	const lower = name.toLowerCase();

	// Skip if already added
	if (content.includes(`./app/${lower}`)) {
		console.log(`⚠ Service ${name} already exists in index.ts, skipping`);
		return;
	}

	const requireLine = `const ${lower} = require("./app/${lower}")(prisma);`;
	const useLine = `app.use(config.baseApiPath, ${lower});`;

	// Insert require after the last existing require("./app/..."), or after Prisma init
	const requireRegex = /const\s+\w+\s*=\s*require\("\.\/app\/[^\)]*\)\(prisma\);/g;
	let lastRequire: RegExpExecArray | null = null;
	let match: RegExpExecArray | null;
	while ((match = requireRegex.exec(content)) !== null) {
		lastRequire = match;
	}
	if (lastRequire) {
		const insertPos = lastRequire.index + lastRequire[0].length;
		content = content.slice(0, insertPos) + "\n" + requireLine + content.slice(insertPos);
	} else {
		const prismaInitRegex = /(const\s+prisma\s*=\s*new\s+PrismaClient\(\);)/;
		if (prismaInitRegex.test(content)) {
			content = content.replace(prismaInitRegex, `$1\n${requireLine}`);
		} else {
			// If Prisma init not found, prepend near top as a fallback
			content = requireLine + "\n" + content;
		}
	}

	// Insert app.use after the last app.use(config.baseApiPath, ...), or before server.listen
	const useRegex = /app\.use\(config\.baseApiPath,\s*\w+\);/g;
	let lastUse: RegExpExecArray | null = null;
	while ((match = useRegex.exec(content)) !== null) {
		lastUse = match;
	}
	if (lastUse) {
		const insertPos = lastUse.index + lastUse[0].length;
		content = content.slice(0, insertPos) + "\n" + useLine + content.slice(insertPos);
	} else {
		const serverListenRegex = /(server\.listen\()/;
		if (serverListenRegex.test(content)) {
			content = content.replace(serverListenRegex, `${useLine}\n\n$1`);
		} else {
			content += `\n${useLine}\n`;
		}
	}

	fs.writeFileSync(indexFile, content, "utf8");
	console.log(`✔ Added ${name} to index.ts`);
}

function scaffoldTestForService(name: string, source: string) {
	if (!fs.existsSync(testsDir)) return;
	const lower = name.toLowerCase();
	const pascal = toPascalCase(name);
	const sourceTestFile = path.join(
		getTemplateTestsDir(),
		`${source.toLowerCase()}.controller.spec.ts`,
	);
	const targetTestFile = path.join(testsDir, `${name}.controller.spec.ts`);

	if (!fs.existsSync(sourceTestFile)) {
		console.log(`⚠ Test template not found at ${sourceTestFile}, skipping test generation`);
		return;
	}
	if (fs.existsSync(targetTestFile)) return;

	const content = fs.readFileSync(sourceTestFile, "utf8");
	const replaced = replaceAllIdentifiers(content, name, source);
	fs.writeFileSync(targetTestFile, replaced, "utf8");
	console.log(`✔ Created test file: ${targetTestFile}`);
}

function main() {
	const rawName = process.argv[2];

	if (!rawName) {
		console.error("Usage: npx msa-generate --<name>");
		console.error("Examples:");
		console.error("  npx msa-generate --all     # generate full codebase");
		console.error("  npx msa-generate --user    # scaffold a single 'user' service");
		process.exit(1);
	}

	// Validate the service name and preserve original casing
	const name = validateServiceName(rawName);

	if (name.length === 0) {
		console.error("Error: Name cannot be empty");
		console.error("Please provide a name with at least one alphanumeric character");
		process.exit(1);
	}

	const source = "template"; // Default source is always template
	const sourceDir = getTemplateAppDir();

	if (!fs.existsSync(sourceDir)) {
		console.error(`❌ Missing template directory at ${sourceDir}`);
		console.error(`📁 Current working directory: ${process.cwd()}`);
		console.error(`📁 Script directory: ${__dirname}`);
		console.error(`📁 Package templates directory: ${packageTemplatesDir}`);
		console.error(`📁 Template app directory: ${packageTemplateAppDir}`);
		console.error(
			`Make sure you're running this command from a project that has the template structure, or install the package with templates.`,
		);
		process.exit(1);
	}

	console.log(`📁 Using template directory: ${sourceDir}`);

	const targetDir = path.join(appDir, name);
	if (fs.existsSync(targetDir)) {
		console.error(`❌ Target already exists: ${targetDir}. Aborting to avoid overwrite.`);
		console.error(`💡 If you want to regenerate this service, delete the directory first.`);
		process.exit(1);
	}

	console.log(`🚀 Generating ${name} service from template...`);
	fs.mkdirSync(targetDir, { recursive: true });

	console.log(`📁 Copying files from ${sourceDir} to ${targetDir}`);
	copyAndTransform(sourceDir, targetDir, name, source);

	console.log(`📝 Updating constants for ${name} service...`);
	updateConstantsForService(name);

	console.log(`🔧 Generating Zod schemas for ${name}...`);
	scaffoldZodForService(name, source);

	console.log(`🗄️ Generating Prisma schema for ${name}...`);
	scaffoldPrismaForService(name, source);

	console.log(`🌱 Generating seeder for ${name}...`);
	scaffoldSeederForService(name, source);

	console.log(`🧪 Generating tests for ${name}...`);
	scaffoldTestForService(name, source);

	console.log(`🔗 Updating index.ts for ${name}...`);
	updateIndexFile(name);

	console.log(`🌱 Updating seed file for ${name}...`);
	updateSeedFile(name);

	console.log(`✅ Successfully generated ${name} service at app/${name.toLowerCase()}`);
	console.log(`📋 Generated files:`);
	console.log(`   - app/${name}/${name}.controller.ts`);
	console.log(`   - app/${name}/${name}.router.ts`);
	console.log(`   - app/${name}/index.ts`);
	console.log(`   - zod/${name}.zod.ts`);
	console.log(`   - prisma/schema/${name}.prisma`);
	console.log(`   - prisma/seeds/${name}Seeder.ts`);
	console.log(`   - tests/${name}.controller.spec.ts`);
	console.log(`   - Updated config/constant.ts`);
	console.log(`   - Updated index.ts`);
	console.log(`   - Updated prisma/seed.ts`);
}

main();
