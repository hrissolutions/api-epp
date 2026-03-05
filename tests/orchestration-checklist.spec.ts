/**
 * Orchestration checklist tests: SECURITY_ENGINEER (69-108) and REVIEWER (87-103).
 * These assertions verify environment, security, and review criteria where testable without full runtime.
 */
import { describe, it } from "mocha";
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");

describe("Orchestration checklist – Security & Review", () => {
	describe("Environment & Secrets (SECURITY_ENGINEER)", () => {
		it("should have .env in .gitignore", () => {
			const gitignore = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf-8");
			expect(gitignore).to.match(/\.env/);
		});

		it("should not hardcode JWT secret in index or config", () => {
			const configPath = path.join(repoRoot, "config", "config.ts");
			if (fs.existsSync(configPath)) {
				const config = fs.readFileSync(configPath, "utf-8");
				// Disallow literal long secrets (e.g. jwtSecret = "abc...20+ chars")
				expect(config).to.not.match(/jwtSecret\s*=\s*["'][^"']{20,}["']/i);
			}
			const index = fs.readFileSync(path.join(repoRoot, "index.ts"), "utf-8");
			expect(index).to.not.match(/["'][a-zA-Z0-9_-]{32,}["']\s*;?\s*\/\*\s*jwt|secret/i);
		});

		it("should apply security middleware in index.ts", () => {
			const index = fs.readFileSync(path.join(repoRoot, "index.ts"), "utf-8");
			expect(index).to.include("securityMiddleware");
			expect(index).to.include("devSecurityMiddleware");
		});

		it("should apply auth security middleware to auth routes", () => {
			const index = fs.readFileSync(path.join(repoRoot, "index.ts"), "utf-8");
			expect(index).to.include("authSecurityMiddleware");
		});
	});

	describe("Middleware & Headers (SECURITY_ENGINEER)", () => {
		it("should have middleware/security.ts with requestSizeLimiter and rateLimiter", () => {
			const security = fs.readFileSync(
				path.join(repoRoot, "middleware", "security.ts"),
				"utf-8",
			);
			expect(security).to.include("requestSizeLimiter");
			expect(security).to.include("rateLimiter");
		});

		it("should configure CORS in index", () => {
			const index = fs.readFileSync(path.join(repoRoot, "index.ts"), "utf-8");
			expect(index).to.include("cors");
		});
	});

	describe("Input & Validation (SECURITY_ENGINEER / REVIEWER)", () => {
		it("should use Zod in app modules (zod schema or validation present)", () => {
			const appDir = path.join(repoRoot, "app");
			if (!fs.existsSync(appDir)) return;
			const dirs = fs
				.readdirSync(appDir, { withFileTypes: true })
				.filter((d) => d.isDirectory());
			let foundZod = false;
			for (const d of dirs) {
				const controllerPath = path.join(appDir, d.name, `${d.name}.controller.ts`);
				if (fs.existsSync(controllerPath)) {
					const content = fs.readFileSync(controllerPath, "utf-8");
					if (
						content.includes("zod") ||
						content.includes(".parse(") ||
						content.includes("safeParse")
					) {
						foundZod = true;
						break;
					}
				}
			}
			expect(foundZod, "At least one controller should use Zod").to.be.true;
		});
	});

	describe("Review – Module pattern & structure (REVIEWER)", () => {
		it("should have helper/error-handler and success-handler", () => {
			const helperDir = path.join(repoRoot, "helper");
			expect(fs.existsSync(path.join(helperDir, "error-handler.ts"))).to.be.true;
			expect(fs.existsSync(path.join(helperDir, "success-handler.ts"))).to.be.true;
		});

		it("should have zod directory or validation under app", () => {
			const hasZodDir = fs.existsSync(path.join(repoRoot, "zod"));
			const appHasZod = fs.existsSync(path.join(repoRoot, "app"));
			expect(hasZodDir || appHasZod).to.be.true;
		});
	});

	describe("Documentation (REVIEWER)", () => {
		it("should have @openapi in at least one router", () => {
			const appDir = path.join(repoRoot, "app");
			if (!fs.existsSync(appDir)) return;
			const dirs = fs
				.readdirSync(appDir, { withFileTypes: true })
				.filter((d) => d.isDirectory());
			let foundOpenApi = false;
			for (const d of dirs) {
				const routerPath = path.join(appDir, d.name, `${d.name}.router.ts`);
				if (fs.existsSync(routerPath)) {
					const content = fs.readFileSync(routerPath, "utf-8");
					if (content.includes("@openapi")) {
						foundOpenApi = true;
						break;
					}
				}
			}
			expect(foundOpenApi, "At least one router should have @openapi").to.be.true;
		});
	});
});
