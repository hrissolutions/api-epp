/**
 * Migration script to add itemType to all existing items
 *
 * This script updates all items in the database to have itemType: "PRODUCT"
 * since all existing data was migrated from the Product model.
 *
 * Usage:
 *   npx ts-node scripts/migrate-items-add-itemtype.ts
 *
 * Or with environment variables:
 *   DATABASE_URL="your-connection-string" npx ts-node scripts/migrate-items-add-itemtype.ts
 *
 * Options:
 *   --dry-run    : Preview changes without applying them
 *   --force      : Skip confirmation prompt
 */

import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";

const logger = getLogger();
const migrationLogger = logger.child({ module: "migrateItemsItemType" });

interface MigrationOptions {
	dryRun?: boolean;
	force?: boolean;
}

async function migrateItemsAddItemType(options: MigrationOptions = {}) {
	const { dryRun = false, force = false } = options;
	const prisma = new PrismaClient();

	try {
		migrationLogger.info("Starting migration: Adding itemType to all items...");
		migrationLogger.info(`Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}`);

		// Use raw MongoDB query to find items that actually don't have itemType in the database
		// Prisma applies defaults when reading, so we need to check the raw data
		migrationLogger.info("Checking database for items without itemType field...");

		// Get MongoDB client from Prisma
		const mongoClient = (prisma as any).$getClient?.() || (prisma as any)._connection?.client;

		if (!mongoClient) {
			// Fallback: Use Prisma's $queryRaw if available
			migrationLogger.info("Using Prisma $queryRaw to find items without itemType...");

			// Find items where itemType doesn't exist or is null
			const itemsWithoutItemType = await (prisma as any).$queryRaw`
				SELECT _id, sku, name 
				FROM items 
				WHERE itemType IS NULL OR itemType = ''
			`.catch(() => {
				// If raw query doesn't work, try a different approach
				migrationLogger.warn("Raw query failed, trying alternative method...");
				return [];
			});

			// If raw query worked, use those IDs
			if (Array.isArray(itemsWithoutItemType) && itemsWithoutItemType.length > 0) {
				const itemIds = itemsWithoutItemType.map((item: any) => item._id.toString());
				migrationLogger.info(
					`Found ${itemIds.length} items without itemType using raw query`,
				);

				// Fetch full item details using Prisma
				const itemsToUpdate = await prisma.item.findMany({
					where: { id: { in: itemIds } },
					select: {
						id: true,
						sku: true,
						name: true,
						itemType: true,
					},
				});

				migrationLogger.info(`Found ${itemsToUpdate.length} items to update`);

				// Continue with the migration using these items
				if (itemsToUpdate.length === 0) {
					migrationLogger.info(
						"All items already have itemType set. No migration needed.",
					);
					return {
						total: itemsWithoutItemType.length,
						updated: 0,
						skipped: itemsWithoutItemType.length,
					};
				}

				// Skip to the update section
				const allItems = await prisma.item.findMany({
					select: { id: true },
				});
				migrationLogger.info(`Total items in database: ${allItems.length}`);
				migrationLogger.info(`Items that need itemType update: ${itemsToUpdate.length}`);
				migrationLogger.info(
					`Items already with itemType: ${allItems.length - itemsToUpdate.length}`,
				);

				// Show sample and continue with migration
				if (itemsToUpdate.length > 0) {
					migrationLogger.info("Sample of items to be updated:");
					itemsToUpdate.slice(0, 5).forEach((item) => {
						migrationLogger.info(
							`  - ${item.sku} (${item.name}): itemType = missing → PRODUCT`,
						);
					});
					if (itemsToUpdate.length > 5) {
						migrationLogger.info(`  ... and ${itemsToUpdate.length - 5} more items`);
					}
				}

				// Continue with the rest of the migration logic below...
				// (The code will continue from the confirmation prompt section)
			} else {
				// Raw query didn't work or returned empty, try updating all items
				migrationLogger.warn(
					"Could not determine which items need updating. Will update all items.",
				);
				const allItems = await prisma.item.findMany({
					select: {
						id: true,
						sku: true,
						name: true,
					},
				});

				migrationLogger.info(`Found ${allItems.length} items in database`);
				migrationLogger.warn(
					"Since we cannot detect missing itemType, we will update ALL items to ensure itemType is set.",
				);

				// Use all items as items to update
				const itemsToUpdate = allItems;

				if (itemsToUpdate.length === 0) {
					migrationLogger.info("No items found in database.");
					return {
						total: 0,
						updated: 0,
						skipped: 0,
					};
				}

				// Show sample and continue
				migrationLogger.info("Sample of items to be updated:");
				itemsToUpdate.slice(0, 5).forEach((item) => {
					migrationLogger.info(
						`  - ${item.sku} (${item.name}): itemType = will be set → PRODUCT`,
					);
				});
				if (itemsToUpdate.length > 5) {
					migrationLogger.info(`  ... and ${itemsToUpdate.length - 5} more items`);
				}
			}
		}

		// If we got here from the raw query path, we need to get itemsToUpdate
		// Otherwise, use the original logic
		let itemsToUpdate: any[] = [];

		if (!mongoClient) {
			// We already handled this case above, so itemsToUpdate should be set
			// But if we reach here, we need to fetch it again
			const allItems = await prisma.item.findMany({
				select: {
					id: true,
					sku: true,
					name: true,
				},
			});
			itemsToUpdate = allItems;
		} else {
			// Use MongoDB native client to find items without itemType
			const db = mongoClient.db();
			const itemsCollection = db.collection("items");

			// Find items where itemType field doesn't exist or is null
			const itemsWithoutItemType = await itemsCollection
				.find({
					$or: [{ itemType: { $exists: false } }, { itemType: null }, { itemType: "" }],
				})
				.toArray();

			migrationLogger.info(
				`Found ${itemsWithoutItemType.length} items without itemType in database`,
			);

			if (itemsWithoutItemType.length === 0) {
				const totalItems = await itemsCollection.countDocuments({});
				migrationLogger.info(`Total items in database: ${totalItems}`);
				migrationLogger.info("All items already have itemType set. No migration needed.");
				return {
					total: totalItems,
					updated: 0,
					skipped: totalItems,
				};
			}

			// Get item IDs
			const itemIds = itemsWithoutItemType.map((item: any) => item._id.toString());

			// Fetch full item details using Prisma
			itemsToUpdate = await prisma.item.findMany({
				where: { id: { in: itemIds } },
				select: {
					id: true,
					sku: true,
					name: true,
					itemType: true,
				},
			});

			const allItems = await prisma.item.findMany({
				select: { id: true },
			});

			migrationLogger.info(`Total items in database: ${allItems.length}`);
			migrationLogger.info(`Items that need itemType update: ${itemsToUpdate.length}`);
			migrationLogger.info(
				`Items already with itemType: ${allItems.length - itemsToUpdate.length}`,
			);
		}

		migrationLogger.info(`Items that need itemType update: ${itemsToUpdate.length}`);
		migrationLogger.info(
			`Items already with itemType: ${allItems.length - itemsToUpdate.length}`,
		);

		if (itemsToUpdate.length === 0) {
			migrationLogger.info("All items already have itemType set. No migration needed.");
			return {
				total: allItems.length,
				updated: 0,
				skipped: allItems.length,
			};
		}

		// Show sample of items that will be updated
		if (itemsToUpdate.length > 0) {
			migrationLogger.info("Sample of items to be updated:");
			itemsToUpdate.slice(0, 5).forEach((item) => {
				migrationLogger.info(
					`  - ${item.sku} (${item.name}): itemType = ${item.itemType || "null"} → PRODUCT`,
				);
			});
			if (itemsToUpdate.length > 5) {
				migrationLogger.info(`  ... and ${itemsToUpdate.length - 5} more items`);
			}
		}

		// Confirmation prompt (unless force flag is set)
		if (!force && !dryRun) {
			migrationLogger.warn(
				`\n⚠️  WARNING: This will update ${itemsToUpdate.length} items in the database.`,
			);
			migrationLogger.warn("Press Ctrl+C to cancel, or wait 5 seconds to continue...");

			// Wait 5 seconds for user to cancel
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}

		if (dryRun) {
			migrationLogger.info("\n🔍 DRY RUN MODE - No changes will be made");
			migrationLogger.info(
				`Would update ${itemsToUpdate.length} items with itemType: "PRODUCT"`,
			);
			return {
				total: allItems.length,
				updated: itemsToUpdate.length,
				skipped: allItems.length - itemsToUpdate.length,
				dryRun: true,
			};
		}

		// Update items in batches to avoid overwhelming the database
		const batchSize = 100;
		let updatedCount = 0;
		let errorCount = 0;

		migrationLogger.info(`\nUpdating items in batches of ${batchSize}...`);

		for (let i = 0; i < itemsToUpdate.length; i += batchSize) {
			const batch = itemsToUpdate.slice(i, i + batchSize);
			const batchNumber = Math.floor(i / batchSize) + 1;
			const totalBatches = Math.ceil(itemsToUpdate.length / batchSize);

			migrationLogger.info(
				`Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)...`,
			);

			try {
				// Update all items in this batch
				const updatePromises = batch.map((item) =>
					prisma.item.update({
						where: { id: item.id },
						data: { itemType: "PRODUCT" },
					}),
				);

				await Promise.all(updatePromises);
				updatedCount += batch.length;

				migrationLogger.info(
					`✓ Batch ${batchNumber} completed: ${batch.length} items updated`,
				);
			} catch (batchError: any) {
				errorCount += batch.length;
				migrationLogger.error(`✗ Batch ${batchNumber} failed: ${batchError.message}`);
				// Continue with next batch
			}
		}

		migrationLogger.info("\n" + "=".repeat(60));
		migrationLogger.info("Migration Summary:");
		migrationLogger.info(`  Total items in database: ${allItems.length}`);
		migrationLogger.info(`  Items updated: ${updatedCount}`);
		migrationLogger.info(
			`  Items skipped (already had itemType): ${allItems.length - itemsToUpdate.length}`,
		);
		if (errorCount > 0) {
			migrationLogger.warn(`  Items with errors: ${errorCount}`);
		}
		migrationLogger.info("=".repeat(60));

		// Verify the update
		migrationLogger.info("\nVerifying migration...");
		const verifyItems = await prisma.item.findMany({
			where: {
				OR: [{ itemType: null }, { itemType: undefined as any }],
			},
			select: { id: true, sku: true },
		});

		if (verifyItems.length === 0) {
			migrationLogger.info("✓ Verification passed: All items now have itemType set");
		} else {
			migrationLogger.warn(
				`⚠ Verification found ${verifyItems.length} items still without itemType`,
			);
		}

		return {
			total: allItems.length,
			updated: updatedCount,
			skipped: allItems.length - itemsToUpdate.length,
			errors: errorCount,
		};
	} catch (error: any) {
		migrationLogger.error(`Migration failed: ${error.message}`);
		migrationLogger.error(error.stack);
		throw error;
	} finally {
		await prisma.$disconnect();
		migrationLogger.info("Database connection closed.");
	}
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: MigrationOptions = {
	dryRun: args.includes("--dry-run") || args.includes("-d"),
	force: args.includes("--force") || args.includes("-f"),
};

// Run migration if script is executed directly
if (require.main === module) {
	migrationLogger.info("=".repeat(60));
	migrationLogger.info("Item Type Migration Script");
	migrationLogger.info("=".repeat(60));
	migrationLogger.info("This script will update all items to have itemType: 'PRODUCT'");
	migrationLogger.info("");

	migrateItemsAddItemType(options)
		.then((result) => {
			migrationLogger.info("\n✅ Migration script completed successfully");
			if (result.dryRun) {
				migrationLogger.info("This was a dry run. Use without --dry-run to apply changes.");
			}
			process.exit(0);
		})
		.catch((error) => {
			migrationLogger.error(`\n❌ Migration script failed: ${error.message}`);
			process.exit(1);
		});
}

export { migrateItemsAddItemType };
