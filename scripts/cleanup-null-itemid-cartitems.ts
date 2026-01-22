/**
 * Cleanup script to remove cart items with null itemId
 *
 * This script removes cart items that have null itemId values,
 * which can occur from data migration issues or old data.
 *
 * Usage:
 *   npx ts-node scripts/cleanup-null-itemid-cartitems.ts
 *
 * Or with environment variables:
 *   DATABASE_URL="your-connection-string" npx ts-node scripts/cleanup-null-itemid-cartitems.ts
 */

import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";

const logger = getLogger();
const cleanupLogger = logger.child({ module: "cleanupCartItems" });

async function cleanupNullItemIdCartItems() {
	const prisma = new PrismaClient();

	try {
		cleanupLogger.info("Starting cleanup of cart items with null itemId...");

		// Use MongoDB's native driver to find and delete cart items with null itemId
		// Note: Prisma can't query for null values on non-nullable fields,
		// so we need to use the MongoDB client directly
		const mongoClient = (prisma as any).$connect ? await (prisma as any).$getClient() : null;

		if (!mongoClient) {
			// Fallback: Try to use Prisma's internal MongoDB client
			const db = (prisma as any)._connection?.db || (prisma as any).$getClient?.()?.db();

			if (db) {
				const cartItemsCollection = db.collection("cartItems");

				// Find cart items with null itemId
				const nullItemIdCartItems = await cartItemsCollection
					.find({
						itemId: null,
					})
					.toArray();

				cleanupLogger.info(
					`Found ${nullItemIdCartItems.length} cart items with null itemId`,
				);

				if (nullItemIdCartItems.length > 0) {
					// Delete cart items with null itemId
					const deleteResult = await cartItemsCollection.deleteMany({
						itemId: null,
					});

					cleanupLogger.info(
						`Deleted ${deleteResult.deletedCount} cart items with null itemId`,
					);

					// Log details of deleted items
					nullItemIdCartItems.forEach((item: any) => {
						cleanupLogger.info(
							`Deleted cart item: id=${item._id}, employeeId=${item.employeeId}`,
						);
					});
				} else {
					cleanupLogger.info("No cart items with null itemId found. Database is clean.");
				}
			} else {
				cleanupLogger.error(
					"Could not access MongoDB client. Please run this cleanup manually using MongoDB shell:",
				);
				cleanupLogger.info("db.cartItems.deleteMany({ itemId: null })");
			}
		}
	} catch (error: any) {
		cleanupLogger.error(`Error during cleanup: ${error.message}`);
		cleanupLogger.error("Manual cleanup required. Run this in MongoDB shell:");
		cleanupLogger.error("db.cartItems.deleteMany({ itemId: null })");
		throw error;
	} finally {
		await prisma.$disconnect();
		cleanupLogger.info("Cleanup completed. Database connection closed.");
	}
}

// Run cleanup if script is executed directly
if (require.main === module) {
	cleanupNullItemIdCartItems()
		.then(() => {
			cleanupLogger.info("Cleanup script completed successfully");
			process.exit(0);
		})
		.catch((error) => {
			cleanupLogger.error(`Cleanup script failed: ${error}`);
			process.exit(1);
		});
}

export { cleanupNullItemIdCartItems };
