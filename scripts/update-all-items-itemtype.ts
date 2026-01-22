/**
 * Script to update all items to have itemType: "PRODUCT"
 *
 * This script updates ALL items in the database to have itemType: "PRODUCT"
 * regardless of their current itemType value. This is useful after migrating
 * from Product to Item model.
 *
 * Usage:
 *   npx ts-node scripts/update-all-items-itemtype.ts
 *
 * Options:
 *   --dry-run    : Preview changes without applying them
 *   --force      : Skip confirmation prompt
 */

import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";

const logger = getLogger();
const updateLogger = logger.child({ module: "updateItemsItemType" });

interface UpdateOptions {
	dryRun?: boolean;
	force?: boolean;
}

async function updateAllItemsItemType(options: UpdateOptions = {}) {
	const { dryRun = false, force = false } = options;
	const prisma = new PrismaClient();

	try {
		updateLogger.info("=".repeat(60));
		updateLogger.info("Update All Items: Set itemType to PRODUCT");
		updateLogger.info("=".repeat(60));
		updateLogger.info(`Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}`);

		// Count total items
		updateLogger.info("Counting items in database...");
		const totalCount = await prisma.item.count();
		updateLogger.info(`Found ${totalCount} items in database`);

		if (totalCount === 0) {
			updateLogger.info("No items found in database. Nothing to update.");
			return {
				total: 0,
				updated: 0,
			};
		}

		// Show sample of items
		updateLogger.info("Fetching sample of items...");
		const sampleItems = await prisma.item.findMany({
			take: 5,
			select: {
				id: true,
				sku: true,
				name: true,
				itemType: true,
			},
		});

		if (sampleItems.length > 0) {
			updateLogger.info("Sample of items that will be updated:");
			sampleItems.forEach((item) => {
				updateLogger.info(
					`  - ${item.sku} (${item.name}): itemType = ${item.itemType || "null/undefined"} → PRODUCT`,
				);
			});
			if (totalCount > 5) {
				updateLogger.info(`  ... and ${totalCount - 5} more items`);
			}
		}

		if (dryRun) {
			updateLogger.info("\n🔍 DRY RUN MODE - No changes will be made");
			updateLogger.info(`Would update ${totalCount} items with itemType: "PRODUCT"`);
			return {
				total: totalCount,
				updated: totalCount,
				dryRun: true,
			};
		}

		// Confirmation prompt (unless force flag is set)
		if (!force) {
			updateLogger.warn(
				`\n⚠️  WARNING: This will update ALL ${totalCount} items in the database.`,
			);
			updateLogger.warn("All items will be set to itemType: 'PRODUCT'");
			updateLogger.warn("Press Ctrl+C to cancel, or wait 5 seconds to continue...");

			// Wait 5 seconds for user to cancel
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}

		// Update all items in batches
		const batchSize = 100;
		let updatedCount = 0;
		let errorCount = 0;
		const totalBatches = Math.ceil(totalCount / batchSize);

		updateLogger.info(`\nUpdating all items in batches of ${batchSize}...`);

		// Process in batches
		for (let skip = 0; skip < totalCount; skip += batchSize) {
			const batchNumber = Math.floor(skip / batchSize) + 1;
			let batchLength = 0;

			try {
				// Get batch of items
				const batch = await prisma.item.findMany({
					skip,
					take: batchSize,
					select: { id: true },
				});

				if (batch.length === 0) break;

				batchLength = batch.length;

				// Update all items in this batch
				const updateResult = await prisma.item.updateMany({
					where: {
						id: { in: batch.map((item) => item.id) },
					},
					data: {
						itemType: "PRODUCT",
					},
				});

				updatedCount += updateResult.count;
				updateLogger.info(
					`✓ Batch ${batchNumber}/${totalBatches} completed: ${updateResult.count} items updated`,
				);
			} catch (batchError: any) {
				errorCount += batchLength || batchSize;
				updateLogger.error(
					`✗ Batch ${batchNumber}/${totalBatches} failed: ${batchError.message}`,
				);
				// Continue with next batch
			}
		}

		updateLogger.info("\n" + "=".repeat(60));
		updateLogger.info("Update Summary:");
		updateLogger.info(`  Total items in database: ${totalCount}`);
		updateLogger.info(`  Items updated: ${updatedCount}`);
		if (errorCount > 0) {
			updateLogger.warn(`  Items with errors: ${errorCount}`);
		}
		updateLogger.info("=".repeat(60));

		// Verify the update
		updateLogger.info("\nVerifying update...");
		const itemsWithProduct = await prisma.item.count({
			where: { itemType: "PRODUCT" },
		});

		const itemsWithoutProduct = await prisma.item.count({
			where: {
				NOT: { itemType: "PRODUCT" },
			},
		});

		updateLogger.info(`Items with itemType = PRODUCT: ${itemsWithProduct}`);
		if (itemsWithoutProduct > 0) {
			updateLogger.warn(`Items without itemType = PRODUCT: ${itemsWithoutProduct}`);
		} else {
			updateLogger.info("✓ Verification passed: All items now have itemType = PRODUCT");
		}

		return {
			total: totalCount,
			updated: updatedCount,
			errors: errorCount,
			verified: {
				withProduct: itemsWithProduct,
				withoutProduct: itemsWithoutProduct,
			},
		};
	} catch (error: any) {
		updateLogger.error(`Update failed: ${error.message}`);
		updateLogger.error(error.stack);
		throw error;
	} finally {
		await prisma.$disconnect();
		updateLogger.info("Database connection closed.");
	}
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: UpdateOptions = {
	dryRun: args.includes("--dry-run") || args.includes("-d"),
	force: args.includes("--force") || args.includes("-f"),
};

// Run update if script is executed directly
if (require.main === module) {
	updateAllItemsItemType(options)
		.then((result) => {
			updateLogger.info("\n✅ Update script completed successfully");
			if (result.dryRun) {
				updateLogger.info("This was a dry run. Use without --dry-run to apply changes.");
			}
			process.exit(0);
		})
		.catch((error) => {
			updateLogger.error(`\n❌ Update script failed: ${error.message}`);
			process.exit(1);
		});
}

export { updateAllItemsItemType };
