/**
 * Migration script: copy vendorId → supplierId on items collection, then remove vendorId.
 *
 * Use this after renaming Vendor to Supplier. Items that still have the old
 * "vendorId" field (and missing or null "supplierId") will be updated so
 * supplierId gets the value of vendorId and vendorId is removed.
 *
 * Usage:
 *   npx ts-node scripts/migrate-items-vendorId-to-supplierId.ts
 *
 * Options:
 *   --dry-run       : Log what would be updated, no changes written
 *   --default-id=ID : For items with no vendorId/supplierId, set supplierId to this ObjectId (24 hex)
 */

import { ObjectId } from "mongodb";
import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";
import { connectAllDatabases, disconnectAllDatabases } from "../config/database";

const logger = getLogger();
const migrationLogger = logger.child({ module: "migrateItemsVendorIdToSupplierId" });

const ITEMS_COLLECTION = "items";

async function migrateItemsVendorIdToSupplierId() {
	const prisma = new PrismaClient();

	try {
		await connectAllDatabases();

		migrationLogger.info("============================================================");
		migrationLogger.info("Items: vendorId → supplierId migration");
		migrationLogger.info("============================================================");

		const dryRun = process.argv.includes("--dry-run");
		const defaultIdArg = process.argv.find((a) => a.startsWith("--default-id="));
		const defaultSupplierId = defaultIdArg
			? defaultIdArg.replace("--default-id=", "").trim()
			: null;
		if (dryRun) {
			migrationLogger.info("DRY RUN - no changes will be written");
			migrationLogger.info("");
		}
		if (defaultSupplierId && !/^[0-9a-fA-F]{24}$/.test(defaultSupplierId)) {
			migrationLogger.error("--default-id must be a 24-character hex MongoDB ObjectId");
			process.exit(1);
		}

		// --- Pass 1: Copy vendorId → supplierId and remove vendorId ---
		// Use a high limit so we get all items (MongoDB find default first batch is 101)
		const BATCH_SIZE = 5000;
		let totalUpdated = 0;
		let totalSkipped = 0;
		let totalErrors = 0;
		let skip = 0;
		let items: Array<{
			_id: unknown;
			sku?: string;
			name?: string;
			vendorId: unknown;
			supplierId?: unknown;
		}> = [];

		do {
			const findResult = (await prisma.$runCommandRaw({
				find: ITEMS_COLLECTION,
				filter: { vendorId: { $exists: true } },
				projection: { _id: 1, sku: 1, name: 1, vendorId: 1, supplierId: 1 },
				skip,
				limit: BATCH_SIZE,
				batchSize: BATCH_SIZE, // so firstBatch returns up to BATCH_SIZE (default is 101)
			})) as {
				cursor?: {
					firstBatch?: Array<{
						_id: unknown;
						sku?: string;
						name?: string;
						vendorId: unknown;
						supplierId?: unknown;
					}>;
				};
			};

			items = findResult.cursor?.firstBatch ?? [];
			if (skip === 0) {
				migrationLogger.info(
					`Found batch of ${items.length} item(s) with vendorId (skip=${skip})`,
				);
			} else if (items.length > 0) {
				migrationLogger.info(`Next batch: ${items.length} item(s) (skip=${skip})`);
			}

			for (const doc of items) {
				const vendorId = doc.vendorId;
				if (vendorId === undefined || vendorId === null) {
					totalSkipped++;
					continue;
				}

				const id = doc._id;
				const idObj = typeof id === "string" ? new ObjectId(id) : id;

				if (dryRun) {
					if (totalUpdated + totalSkipped + totalErrors < 20) {
						migrationLogger.info(
							`  [dry-run] Would set supplierId and remove vendorId for item ${doc.sku ?? id}`,
						);
					}
					totalUpdated++;
					continue;
				}

				try {
					// Copy vendorId → supplierId; use ObjectId when value is 24-char hex (MongoDB convention)
					let supplierIdToSet: ObjectId | string = vendorId as string;
					if (
						typeof supplierIdToSet === "string" &&
						/^[0-9a-fA-F]{24}$/.test(supplierIdToSet)
					) {
						supplierIdToSet = new ObjectId(supplierIdToSet);
					}

					await prisma.$runCommandRaw({
						update: ITEMS_COLLECTION,
						updates: [
							{
								q: { _id: idObj },
								u: {
									$set: { supplierId: supplierIdToSet },
									$unset: { vendorId: "" },
								},
								upsert: false,
								multi: false,
							},
						],
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
					} as any);
					totalUpdated++;
				} catch (err) {
					migrationLogger.error(`Error updating item ${doc.sku ?? id}: ${err}`);
					totalErrors++;
				}
			}

			skip += items.length;
		} while (items.length === BATCH_SIZE);

		migrationLogger.info(
			`Pass 1 result: updated=${totalUpdated}, skipped=${totalSkipped}, errors=${totalErrors}`,
		);

		// --- Pass 2: Items with null/missing supplierId (and no vendorId) → set default supplier if provided ---
		if (defaultSupplierId && !dryRun) {
			const missingResult = (await prisma.$runCommandRaw({
				find: ITEMS_COLLECTION,
				filter: {
					$or: [{ supplierId: { $exists: false } }, { supplierId: null }],
				},
				projection: { _id: 1, sku: 1, name: 1 },
			})) as {
				cursor?: { firstBatch?: Array<{ _id: unknown; sku?: string; name?: string }> };
			};
			const missing = missingResult.cursor?.firstBatch ?? [];
			migrationLogger.info(
				`Pass 2: ${missing.length} item(s) with no supplierId; setting default supplier ${defaultSupplierId}`,
			);
			const defaultObjId = new ObjectId(defaultSupplierId);
			for (const doc of missing) {
				const id = doc._id;
				const idObj = typeof id === "string" ? new ObjectId(id) : id;
				try {
					await prisma.$runCommandRaw({
						update: ITEMS_COLLECTION,
						updates: [
							{
								q: { _id: idObj },
								u: { $set: { supplierId: defaultObjId } },
								upsert: false,
								multi: false,
							},
						],
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
					} as any);
					totalUpdated++;
				} catch (err) {
					migrationLogger.error(
						`Error setting default supplierId on item ${doc.sku ?? id}: ${err}`,
					);
					totalErrors++;
				}
			}
		} else if (defaultSupplierId && dryRun) {
			const missingResult = (await prisma.$runCommandRaw({
				find: ITEMS_COLLECTION,
				filter: {
					$or: [{ supplierId: { $exists: false } }, { supplierId: null }],
				},
				projection: { _id: 1, sku: 1 },
			})) as { cursor?: { firstBatch?: unknown[] } };
			const missing = missingResult.cursor?.firstBatch ?? [];
			migrationLogger.info(
				`[dry-run] Would set default supplierId on ${missing.length} item(s) with no supplierId`,
			);
		}

		migrationLogger.info("");
		migrationLogger.info("Result:");
		migrationLogger.info(`  Updated: ${totalUpdated}`);
		migrationLogger.info(`  Skipped: ${totalSkipped}`);
		if (totalErrors > 0) migrationLogger.info(`  Errors:  ${totalErrors}`);
		migrationLogger.info("");
		migrationLogger.info("Done.");
	} catch (error) {
		migrationLogger.error(`Migration failed: ${error}`);
		throw error;
	} finally {
		await disconnectAllDatabases();
		await prisma.$disconnect();
	}
}

migrateItemsVendorIdToSupplierId()
	.then(() => process.exit(0))
	.catch(() => process.exit(1));
