/**
 * Remove all Delivery Documents (DO/DR) that don't have fromParty or toParty.
 * These cause "Attempted to serialize non-enum-compatible value 'null' for enum 'DeliveryParty'"
 * when listing delivery documents.
 *
 * Usage:
 *   npx ts-node scripts/remove-delivery-docs-without-party.ts
 *
 * Options:
 *   --dry-run   : Log what would be deleted, no changes
 *   --force     : Skip confirmation prompt (use with care)
 */

import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";

const logger = getLogger();
const scriptLogger = logger.child({ module: "removeDeliveryDocsWithoutParty" });

const COLLECTION = "deliveryDocuments";

/** Documents where fromParty or toParty is null or missing */
const MISSING_PARTY_FILTER = {
	$or: [
		{ fromParty: null },
		{ fromParty: { $exists: false } },
		{ toParty: null },
		{ toParty: { $exists: false } },
	],
};

async function removeDeliveryDocsWithoutParty() {
	const dryRun = process.argv.includes("--dry-run");
	const force = process.argv.includes("--force");
	const prisma = new PrismaClient();

	try {
		scriptLogger.info("============================================================");
		scriptLogger.info("Remove DO/DR without fromParty or toParty");
		scriptLogger.info("============================================================");
		if (dryRun) scriptLogger.info("DRY RUN - no documents will be deleted");
		scriptLogger.info("");

		// Find documents missing party fields
		const findResult = (await prisma.$runCommandRaw({
			find: COLLECTION,
			filter: MISSING_PARTY_FILTER,
			projection: { _id: 1, documentNumber: 1, documentType: 1, transferStage: 1 },
			limit: 50000,
		})) as { cursor?: { firstBatch?: any[] } };

		const docs = findResult?.cursor?.firstBatch ?? [];
		const count = docs.length;

		scriptLogger.info(`Found ${count} delivery document(s) without valid party fields.`);

		if (count === 0) {
			scriptLogger.info("Nothing to remove. Exiting.");
			return;
		}

		// Log sample
		docs.slice(0, 10).forEach((d: any) => {
			scriptLogger.info(
				`  - ${d.documentNumber ?? d._id} (${d.documentType ?? "?"}/${d.transferStage ?? "?"})`,
			);
		});
		if (count > 10) scriptLogger.info(`  ... and ${count - 10} more`);

		if (dryRun) {
			scriptLogger.info("");
			scriptLogger.info("Dry run complete. Run without --dry-run to delete.");
			return;
		}

		if (!force) {
			scriptLogger.info("");
			scriptLogger.info("Run with --force to delete these documents, e.g.:");
			scriptLogger.info("  npx ts-node scripts/remove-delivery-docs-without-party.ts --force");
			return;
		}

		// Delete using MongoDB delete command
		const deleteResult = (await prisma.$runCommandRaw({
			delete: COLLECTION,
			deletes: [{ q: MISSING_PARTY_FILTER, limit: 0 }],
			ordered: false,
		})) as { n?: number; ok?: number };

		const deleted = deleteResult?.n ?? 0;
		scriptLogger.info("");
		scriptLogger.info(`Deleted ${deleted} delivery document(s).`);
	} catch (error: any) {
		scriptLogger.error(`Script failed: ${error?.message ?? error}`);
		throw error;
	} finally {
		await prisma.$disconnect();
		scriptLogger.info("Done. Database connection closed.");
	}
}

if (require.main === module) {
	removeDeliveryDocsWithoutParty()
		.then(() => process.exit(0))
		.catch(() => process.exit(1));
}

export { removeDeliveryDocsWithoutParty };
