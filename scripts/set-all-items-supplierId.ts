/**
 * Set supplierId on all items (products) to a given supplier ObjectId.
 *
 * Usage:
 *   npx ts-node scripts/set-all-items-supplierId.ts
 *
 * Default supplierId: 6967254808c11f871550ffe0
 * Override: SUPPLIER_ID=6982a9b58cabc72cc025ee02 npx ts-node scripts/set-all-items-supplierId.ts
 *
 * Options:
 *   --dry-run  : Log count only, no updates
 */

import { ObjectId } from "mongodb";
import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";
import { connectAllDatabases, disconnectAllDatabases } from "../config/database";

const logger = getLogger();
const scriptLogger = logger.child({ module: "setAllItemsSupplierId" });

const ITEMS_COLLECTION = "items";
const DEFAULT_SUPPLIER_ID = "6967254808c11f871550ffe0";

async function main() {
	const prisma = new PrismaClient();
	const dryRun = process.argv.includes("--dry-run");
	const supplierIdStr = process.env.SUPPLIER_ID ?? DEFAULT_SUPPLIER_ID;

	if (!/^[0-9a-fA-F]{24}$/.test(supplierIdStr)) {
		scriptLogger.error("SUPPLIER_ID must be a 24-character hex MongoDB ObjectId");
		process.exit(1);
	}

	try {
		await connectAllDatabases();

		scriptLogger.info("============================================================");
		scriptLogger.info("Set supplierId on all items");
		scriptLogger.info("============================================================");
		scriptLogger.info(`Supplier ID: ${supplierIdStr}`);
		scriptLogger.info(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
		scriptLogger.info("");

		const supplierObjId = new ObjectId(supplierIdStr);

		// Count items
		const countResult = (await prisma.$runCommandRaw({
			count: ITEMS_COLLECTION,
			query: {},
		})) as { n: number };
		const total = countResult.n ?? 0;
		scriptLogger.info(`Total items in collection: ${total}`);

		if (total === 0) {
			scriptLogger.info("No items to update.");
			return;
		}

		if (dryRun) {
			scriptLogger.info(
				`[dry-run] Would set supplierId = ${supplierIdStr} on ${total} item(s).`,
			);
			return;
		}

		// Update all items in one command
		const updateResult = (await prisma.$runCommandRaw({
			update: ITEMS_COLLECTION,
			updates: [
				{
					q: {},
					u: { $set: { supplierId: supplierObjId } },
					upsert: false,
					multi: true,
				},
			],
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as { n?: number; nModified?: number };

		const n =
			(updateResult as { n?: number }).n ??
			(updateResult as { nModified?: number }).nModified ??
			0;
		scriptLogger.info(`Updated ${n} item(s) with supplierId ${supplierIdStr}.`);
		scriptLogger.info("Done.");
	} catch (error) {
		scriptLogger.error(`Script failed: ${error}`);
		throw error;
	} finally {
		await disconnectAllDatabases();
		await prisma.$disconnect();
	}
}

main()
	.then(() => process.exit(0))
	.catch(() => process.exit(1));
