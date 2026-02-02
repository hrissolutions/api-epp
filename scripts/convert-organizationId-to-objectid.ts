/**
 * Script to convert string organizationId values to MongoDB ObjectId type
 *
 * Use this when organizationId is stored as a string (e.g. "697845e3479eaa6d2f796b7c")
 * and you need it stored as BSON ObjectId for queries and consistency.
 *
 * Usage:
 *   npx ts-node scripts/convert-organizationId-to-objectid.ts
 *
 * Options:
 *   --dry-run  : Log how many documents would be converted, no changes
 */

import { ObjectId } from "mongodb";
import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";
import { connectAllDatabases, disconnectAllDatabases } from "../config/database";

const logger = getLogger();
const conversionLogger = logger.child({ module: "convertOrganizationIdToObjectId" });

async function convertOrganizationIdToObjectId() {
	const prisma = new PrismaClient();

	try {
		await connectAllDatabases();

		conversionLogger.info("============================================================");
		conversionLogger.info("Convert String organizationId to ObjectId");
		conversionLogger.info("============================================================");
		conversionLogger.info("");

		const dryRun = process.argv.includes("--dry-run");
		if (dryRun) {
			conversionLogger.info("DRY RUN - no changes will be made");
			conversionLogger.info("");
		}

		const models = [
			{ name: "Item", collection: "items" },
			{ name: "Category", collection: "categories" },
			{ name: "Vendor", collection: "vendors" },
			{ name: "CartItem", collection: "cartItems" },
			{ name: "WishlistItem", collection: "wishlistItems" },
			{ name: "Order", collection: "orders" },
			{ name: "OrderItem", collection: "orderItems" },
			{ name: "Transaction", collection: "transactions" },
			{ name: "Installment", collection: "installments" },
			{ name: "ApprovalWorkflow", collection: "approvalWorkflows" },
			{ name: "ApprovalLevel", collection: "approvalLevels" },
			{ name: "WorkflowApprovalLevel", collection: "workflowApprovalLevels" },
			{ name: "OrderApproval", collection: "orderApprovals" },
			{ name: "Notification", collection: "notifications" },
			{ name: "AuditLogging", collection: "auditLogs" },
			{ name: "Template", collection: "templates" },
			{ name: "PurchaseOrder", collection: "purchaseOrders" },
			{ name: "DeliveryDocument", collection: "deliveryDocuments" },
		];

		let totalConverted = 0;

		for (const model of models) {
			try {
				conversionLogger.info(`Processing ${model.name}...`);

				// Find all documents with string organizationId
				const findResult = await prisma.$runCommandRaw({
					find: model.collection,
					filter: {
						organizationId: { $type: "string" },
					},
					limit: 10000, // Adjust if needed
				});

				const docs = (findResult as any).cursor?.firstBatch || [];
				conversionLogger.info(
					`  Found ${docs.length} documents with string organizationId`,
				);

				if (docs.length === 0) {
					continue;
				}

				// Convert string organizationId to BSON ObjectId (all documents in this batch)
				let converted = 0;
				if (!dryRun) {
					try {
						// Pipeline update: $toObjectId converts string to ObjectId
						const updateResult = await prisma.$runCommandRaw({
							update: model.collection,
							updates: [
								{
									q: { organizationId: { $type: "string" } },
									u: [
										{
											$set: {
												organizationId: { $toObjectId: "$organizationId" },
											},
										},
									],
									multi: true,
								},
							],
						});

						converted =
							(updateResult as { nModified?: number; n?: number }).nModified ??
							(updateResult as { n?: number }).n ??
							0;
						conversionLogger.info(`  Converted ${converted} documents`);
					} catch (error: unknown) {
						const msg = error instanceof Error ? error.message : String(error);
						conversionLogger.warn(`  Raw update failed for ${model.name}: ${msg}`);
						// Fallback: update by _id with ObjectId value
						for (const doc of docs.slice(0, 500)) {
							try {
								const orgIdStr =
									typeof doc.organizationId === "string"
										? doc.organizationId
										: String(doc.organizationId);
								await prisma.$runCommandRaw({
									update: model.collection,
									updates: [
										{
											q: { _id: doc._id },
											u: { $set: { organizationId: new ObjectId(orgIdStr) } },
										},
									],
								});
								converted++;
							} catch (err: unknown) {
								const errMsg = err instanceof Error ? err.message : String(err);
								conversionLogger.warn(`  Failed doc ${doc._id}: ${errMsg}`);
							}
						}
						conversionLogger.info(
							`  Converted ${converted} documents (fallback, max 500)`,
						);
					}
				} else {
					converted = docs.length;
					conversionLogger.info(`  Would convert ${converted} documents (dry run)`);
				}
				totalConverted += converted;
			} catch (error: any) {
				conversionLogger.error(`Error processing ${model.name}: ${error.message}`);
			}
		}

		conversionLogger.info("");
		conversionLogger.info("============================================================");
		conversionLogger.info(
			dryRun
				? `Total documents that would be converted: ${totalConverted}`
				: `Total documents converted: ${totalConverted}`,
		);
		if (dryRun) {
			conversionLogger.info(
				"⚠️  DRY RUN - no changes were made. Run without --dry-run to apply.",
			);
		} else {
			conversionLogger.info("✅ Conversion completed successfully!");
		}
	} catch (error: any) {
		conversionLogger.error("Conversion failed:", error);
		throw error;
	} finally {
		await disconnectAllDatabases();
		await prisma.$disconnect();
	}
}

// Main execution
if (require.main === module) {
	convertOrganizationIdToObjectId()
		.then(() => {
			conversionLogger.info("Script completed successfully.");
			process.exit(0);
		})
		.catch((error) => {
			conversionLogger.error("Script failed:", error);
			process.exit(1);
		});
}

export { convertOrganizationIdToObjectId };
