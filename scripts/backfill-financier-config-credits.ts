/**
 * Backfill FinancierConfig.usedCredits and availableCredits from FinancingAgreement data.
 * - usedCredits = sum(principalAmount) for all FinancingAgreement linked to this config
 * - availableCredits = maxCreditLimit - usedCredits
 *
 * Run once after adding usedCredits/availableCredits so existing configs show correct values.
 * New configs already get availableCredits = maxCreditLimit and usedCredits = 0 on create.
 *
 * Usage:
 *   npx ts-node scripts/backfill-financier-config-credits.ts
 *
 * Options:
 *   --dry-run   Preview updates without writing
 */

import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";
import { connectAllDatabases, disconnectAllDatabases } from "../config/database";

const logger = getLogger();
const scriptLogger = logger.child({ module: "backfillFinancierConfigCredits" });

async function main() {
	const dryRun = process.argv.includes("--dry-run");
	if (dryRun) scriptLogger.info("DRY RUN: no changes will be written");

	await connectAllDatabases();
	const prisma = new PrismaClient();

	try {
		const configs = await prisma.financierConfig.findMany({
			select: {
				id: true,
				name: true,
				code: true,
				maxCreditLimit: true,
				usedCredits: true,
				availableCredits: true,
			},
		});

		scriptLogger.info(`Found ${configs.length} FinancierConfig(s)`);

		for (const config of configs) {
			const agreements = await prisma.financingAgreement.findMany({
				where: { financierConfigId: config.id },
				select: { principalAmount: true },
			});
			const usedCredits = agreements.reduce((sum, a) => sum + a.principalAmount, 0);
			const availableCredits = Math.max(0, config.maxCreditLimit - usedCredits);

			const needsUpdate =
				config.usedCredits !== usedCredits || config.availableCredits !== availableCredits;

			if (needsUpdate) {
				scriptLogger.info(
					`${config.code ?? config.id}: usedCredits ${config.usedCredits} -> ${usedCredits}, availableCredits ${config.availableCredits} -> ${availableCredits}`,
				);
				if (!dryRun) {
					await prisma.financierConfig.update({
						where: { id: config.id },
						data: { usedCredits, availableCredits },
					});
				}
			}
		}

		scriptLogger.info(dryRun ? "Dry run complete." : "Backfill complete.");
	} finally {
		await prisma.$disconnect();
		await disconnectAllDatabases();
	}
}

main().catch((err) => {
	scriptLogger.error(err);
	process.exit(1);
});
