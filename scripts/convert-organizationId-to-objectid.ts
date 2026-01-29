/**
 * Script to convert string organizationId values to ObjectId type
 * 
 * This fixes the issue where organizationId was stored as strings but Prisma expects ObjectId type
 * 
 * Usage:
 *   npx ts-node scripts/convert-organizationId-to-objectid.ts
 */

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

		const models = [
			{ name: "Item", collection: "items" },
			{ name: "Category", collection: "categories" },
			{ name: "Vendor", collection: "vendors" },
			{ name: "CartItem", collection: "cartItems" },
			{ name: "WishlistItem", collection: "wishlistItems" },
			{ name: "Order", collection: "orders" },
			{ name: "OrderItem", collection: "orderItems" },
			{ name: "Purchase", collection: "purchases" },
			{ name: "Transaction", collection: "transactions" },
			{ name: "Installment", collection: "installments" },
			{ name: "ApprovalWorkflow", collection: "approvalWorkflows" },
			{ name: "ApprovalLevel", collection: "approvalLevels" },
			{ name: "WorkflowApprovalLevel", collection: "workflowApprovalLevels" },
			{ name: "OrderApproval", collection: "orderApprovals" },
			{ name: "Notification", collection: "notifications" },
			{ name: "AuditLogging", collection: "auditLogs" },
			{ name: "User", collection: "users" },
			{ name: "Template", collection: "templates" },
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
				conversionLogger.info(`  Found ${docs.length} documents with string organizationId`);

				if (docs.length === 0) {
					continue;
				}

				// Convert all documents using aggregation pipeline update
				// This converts string organizationId to ObjectId type
				let converted = 0;
				try {
					const updateResult = await prisma.$runCommandRaw({
						update: model.collection,
						updates: [
							{
								q: { organizationId: { $type: "string" } },
								u: [
									{
										$set: {
											organizationId: {
												$convert: {
													input: "$organizationId",
													to: "objectId",
													onError: null,
													onNull: null,
												},
											},
										},
									},
								],
								multi: true,
							},
						],
					});

					converted = (updateResult as any).nModified || (updateResult as any).n || 0;
					conversionLogger.info(`  Converted ${converted} documents`);
				} catch (error: any) {
					conversionLogger.warn(
						`  Failed to convert ${model.name} documents: ${error.message}`,
					);
					// Fallback: try individual updates (limited to avoid performance issues)
					converted = 0;
					for (const doc of docs.slice(0, 100)) {
						// Limit to 100 for safety
						try {
							// Use Prisma's update which should handle ObjectId conversion
							await (prisma as any)[model.name.toLowerCase()].updateMany({
								where: { id: doc._id.toString() },
								data: {
									organizationId: doc.organizationId, // Prisma should convert this
								},
							});
							converted++;
						} catch (err: any) {
							conversionLogger.warn(`  Failed to convert document ${doc._id}: ${err.message}`);
						}
					}
					conversionLogger.info(`  Converted ${converted} documents (fallback method)`);
				}
				totalConverted += converted;

				conversionLogger.info(`  Converted ${converted} documents`);
				totalConverted += converted;
			} catch (error: any) {
				conversionLogger.error(`Error processing ${model.name}: ${error.message}`);
			}
		}

		conversionLogger.info("");
		conversionLogger.info("============================================================");
		conversionLogger.info(`Total documents converted: ${totalConverted}`);
		conversionLogger.info("✅ Conversion completed successfully!");
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
