/**
 * Migration script to add organizationId to all existing records
 *
 * This script updates all records in the database to have organizationId: "6944c22f1ba0ef821cb257d9"
 * for records that don't have it set.
 *
 * Usage:
 *   npx ts-node scripts/migrate-add-organizationId.ts
 *
 * Or with environment variables:
 *   DATABASE_URL="your-connection-string" npx ts-node scripts/migrate-add-organizationId.ts
 *
 * Options:
 *   --dry-run    : Preview changes without applying them
 *   --force      : Skip confirmation prompt
 *   --org-id     : Specify a different organizationId (default: 6944c22f1ba0ef821cb257d9)
 */

import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";
import { connectAllDatabases, disconnectAllDatabases } from "../config/database";

const logger = getLogger();
const migrationLogger = logger.child({ module: "migrateOrganizationId" });

const DEFAULT_ORGANIZATION_ID = "6944c22f1ba0ef821cb257d9";

interface MigrationOptions {
	dryRun?: boolean;
	force?: boolean;
	organizationId?: string;
}

interface MigrationResult {
	model: string;
	total: number;
	updated: number;
	skipped: number;
	errors: number;
}

/** Prisma delegates with count/updateMany; used to avoid union-call TS errors. */
type OrgMigrationDelegate = {
	count(args?: { where?: Record<string, unknown> }): Promise<number>;
	updateMany(args: {
		where: Record<string, unknown>;
		data: Record<string, unknown>;
	}): Promise<{ count: number }>;
};

async function migrateOrganizationId(options: MigrationOptions = {}) {
	const { dryRun = false, force = false, organizationId = DEFAULT_ORGANIZATION_ID } = options;
	const prisma = new PrismaClient();

	try {
		await connectAllDatabases();

		migrationLogger.info("============================================================");
		migrationLogger.info("Organization ID Migration Script");
		migrationLogger.info("============================================================");
		migrationLogger.info(
			`This script will update all records to have organizationId: '${organizationId}'`,
		);
		migrationLogger.info(`Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}`);
		migrationLogger.info("");

		// Validate organizationId format (MongoDB ObjectId)
		if (!/^[0-9a-fA-F]{24}$/.test(organizationId)) {
			migrationLogger.error(
				`Invalid organizationId format: ${organizationId}. Must be a valid MongoDB ObjectId (24 hex characters).`,
			);
			process.exit(1);
		}

		if (!force && !dryRun) {
			migrationLogger.warn("⚠️  WARNING: This will update ALL records in the database!");
			migrationLogger.warn("Press Ctrl+C within 5 seconds to cancel...");
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}

		const results: MigrationResult[] = [];

		// Define all models that have organizationId field
		const models = [
			{ name: "Item", prismaModel: prisma.item, collection: "items" },
			{ name: "Category", prismaModel: prisma.category, collection: "categories" },
			{ name: "Vendor", prismaModel: prisma.vendor, collection: "vendors" },
			{ name: "CartItem", prismaModel: prisma.cartItem, collection: "cartItems" },
			{ name: "WishlistItem", prismaModel: prisma.wishlistItem, collection: "wishlistItems" },
			{ name: "Order", prismaModel: prisma.order, collection: "orders" },
			{ name: "OrderItem", prismaModel: prisma.orderItem, collection: "orderItems" },
			{ name: "Purchase", prismaModel: prisma.purchase, collection: "purchases" },
			{ name: "Transaction", prismaModel: prisma.transaction, collection: "transactions" },
			{ name: "Installment", prismaModel: prisma.installment, collection: "installments" },
			{
				name: "ApprovalWorkflow",
				prismaModel: prisma.approvalWorkflow,
				collection: "approvalWorkflows",
			},
			{ name: "ApprovalLevel", prismaModel: prisma.approvalLevel, collection: "approvalLevels" },
			{
				name: "WorkflowApprovalLevel",
				prismaModel: prisma.workflowApprovalLevel,
				collection: "workflowApprovalLevels",
			},
			{ name: "OrderApproval", prismaModel: prisma.orderApproval, collection: "orderApprovals" },
			{ name: "Notification", prismaModel: prisma.notification, collection: "notifications" },
			{ name: "AuditLogging", prismaModel: prisma.auditLogging, collection: "auditLogs" },
			{ name: "User", prismaModel: prisma.user, collection: "users" },
			{ name: "Template", prismaModel: prisma.template, collection: "templates" },
		];

		migrationLogger.info(`Processing ${models.length} models...`);
		migrationLogger.info("");

		// Process each model
		for (const model of models) {
			try {
				migrationLogger.info(`Processing ${model.name}...`);

				const delegate = model.prismaModel as unknown as OrgMigrationDelegate;

				// Get total count
				const total = await delegate.count();
				migrationLogger.info(`  Total ${model.name} records: ${total}`);

				if (total === 0) {
					migrationLogger.info(`  No ${model.name} records found. Skipping.`);
					results.push({
						model: model.name,
						total: 0,
						updated: 0,
						skipped: 0,
						errors: 0,
					});
					continue;
				}

				// Use raw MongoDB update to properly handle missing fields
				// MongoDB treats missing fields differently from null, so we need raw commands
				let updated = 0;
				let skipped = 0;

				if (!dryRun) {
					// Use raw MongoDB updateMany command to update all records
					// This properly handles fields that don't exist
					try {
						const updateResult = await prisma.$runCommandRaw({
							update: model.collection,
							updates: [
								{
									q: {}, // Empty query = match all documents
									u: {
										$set: {
											organizationId: organizationId,
										},
									},
									multi: true, // Update multiple documents
								},
							],
						});

						// Count how many were actually modified
						const modifiedCount = (updateResult as any).nModified || (updateResult as any).n || 0;
						updated = modifiedCount;

						// Count how many already had the correct organizationId
						const countWithCorrectId = await delegate.count({
							where: {
								organizationId: organizationId,
							},
						});

						skipped = countWithCorrectId;
					} catch (rawError: any) {
						// Fallback to Prisma updateMany if raw command fails
						migrationLogger.warn(
							`Raw MongoDB update failed for ${model.name}, using Prisma fallback: ${rawError.message}`,
						);
						const updateResult = await delegate.updateMany({
							where: {}, // Empty where clause = update all records
							data: {
								organizationId: organizationId,
							},
						});

						updated = updateResult.count;
						skipped = 0;
					}
				} else {
					// Dry run: Use raw MongoDB query to count records that need updating
					try {
						const countResult = await prisma.$runCommandRaw({
							count: model.collection,
							query: {
								$or: [
									{ organizationId: { $exists: false } }, // Field doesn't exist
									{ organizationId: null }, // Field is null
									{ organizationId: { $ne: organizationId } }, // Field is different
								],
							},
						});

						updated = (countResult as any).n || 0;
						skipped = total - updated;
					} catch (rawError: any) {
						// Fallback: count records that don't have the correct organizationId
						migrationLogger.warn(
							`Raw MongoDB count failed for ${model.name}, using Prisma fallback: ${rawError.message}`,
						);
						const countWithCorrectId = await delegate.count({
							where: {
								organizationId: organizationId,
							},
						});

						updated = total - countWithCorrectId;
						skipped = countWithCorrectId;
					}
				}

				migrationLogger.info(`  Records to update: ${updated}`);
				migrationLogger.info(`  Records already set: ${skipped}`);

				results.push({
					model: model.name,
					total,
					updated,
					skipped,
					errors: 0,
				});
			} catch (error: any) {
				migrationLogger.error(`Error processing ${model.name}:`, error.message);
				results.push({
					model: model.name,
					total: 0,
					updated: 0,
					skipped: 0,
					errors: 1,
				});
			}
		}

		// Print summary
		migrationLogger.info("");
		migrationLogger.info("============================================================");
		migrationLogger.info("Migration Summary");
		migrationLogger.info("============================================================");

		const totalRecords = results.reduce((sum, r) => sum + r.total, 0);
		const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
		const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
		const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

		migrationLogger.info(`Total records processed: ${totalRecords}`);
		migrationLogger.info(`Records updated: ${totalUpdated}`);
		migrationLogger.info(`Records already set: ${totalSkipped}`);
		migrationLogger.info(`Errors: ${totalErrors}`);

		migrationLogger.info("");
		migrationLogger.info("Detailed Results:");
		migrationLogger.info("");

		results.forEach((result) => {
			if (result.total > 0 || result.errors > 0) {
				migrationLogger.info(
					`${result.model.padEnd(25)} | Total: ${String(result.total).padStart(6)} | Updated: ${String(result.updated).padStart(6)} | Skipped: ${String(result.skipped).padStart(6)} | Errors: ${String(result.errors).padStart(2)}`,
				);
			}
		});

		if (dryRun) {
			migrationLogger.info("");
			migrationLogger.info("⚠️  DRY RUN MODE - No changes were made to the database.");
			migrationLogger.info("Run without --dry-run to apply changes.");
		} else {
			migrationLogger.info("");
			migrationLogger.info("✅ Migration completed successfully!");
		}

		return {
			total: totalRecords,
			updated: totalUpdated,
			skipped: totalSkipped,
			errors: totalErrors,
			results,
		};
	} catch (error: any) {
		migrationLogger.error("Migration failed:", error);
		throw error;
	} finally {
		await disconnectAllDatabases();
		await prisma.$disconnect();
	}
}

// Parse command line arguments
function parseArgs(): MigrationOptions {
	const args = process.argv.slice(2);
	const options: MigrationOptions = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--dry-run" || arg === "-d") {
			options.dryRun = true;
		} else if (arg === "--force" || arg === "-f") {
			options.force = true;
		} else if (arg === "--org-id" && i + 1 < args.length) {
			options.organizationId = args[i + 1];
			i++;
		}
	}

	return options;
}

// Main execution
if (require.main === module) {
	const options = parseArgs();
	migrateOrganizationId(options)
		.then(() => {
			migrationLogger.info("Script completed successfully.");
			process.exit(0);
		})
		.catch((error) => {
			migrationLogger.error("Script failed:", error);
			process.exit(1);
		});
}

export { migrateOrganizationId };
