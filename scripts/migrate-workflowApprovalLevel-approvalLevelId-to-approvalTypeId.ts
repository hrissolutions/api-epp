/**
 * Migration script: copy approvalLevelId → approvalTypeId on workflowApprovalLevels collection,
 * then remove approvalLevelId.
 *
 * Use this after renaming ApprovalLevel to ApprovalType. WorkflowApprovalLevel documents
 * that still have the old "approvalLevelId" field will be updated so approvalTypeId gets
 * the value of approvalLevelId and approvalLevelId is removed.
 *
 * Usage:
 *   npx ts-node scripts/migrate-workflowApprovalLevel-approvalLevelId-to-approvalTypeId.ts
 *
 * Options:
 *   --dry-run  : Log what would be updated, no changes written
 */

import { ObjectId } from "mongodb";
import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";
import { connectAllDatabases, disconnectAllDatabases } from "../config/database";

const logger = getLogger();
const migrationLogger = logger.child({
	module: "migrateWorkflowApprovalLevelApprovalLevelIdToApprovalTypeId",
});

const COLLECTION = "workflowApprovalLevels";
const BATCH_SIZE = 5000;

async function migrate() {
	const prisma = new PrismaClient();

	try {
		await connectAllDatabases();

		migrationLogger.info("============================================================");
		migrationLogger.info("WorkflowApprovalLevel: approvalLevelId → approvalTypeId migration");
		migrationLogger.info("============================================================");

		const dryRun = process.argv.includes("--dry-run");
		if (dryRun) {
			migrationLogger.info("DRY RUN - no changes will be written");
			migrationLogger.info("");
		}

		let totalUpdated = 0;
		let totalErrors = 0;
		let skip = 0;
		let docs: Array<{
			_id: unknown;
			workflowId?: unknown;
			approvalLevelId?: unknown;
			level?: number;
		}> = [];

		do {
			const findResult = (await prisma.$runCommandRaw({
				find: COLLECTION,
				filter: { approvalLevelId: { $exists: true } },
				projection: { _id: 1, workflowId: 1, approvalLevelId: 1, level: 1 },
				skip,
				limit: BATCH_SIZE,
				batchSize: BATCH_SIZE,
			})) as {
				cursor?: {
					firstBatch?: Array<{
						_id: unknown;
						workflowId?: unknown;
						approvalLevelId?: unknown;
						level?: number;
					}>;
				};
			};

			docs = findResult.cursor?.firstBatch ?? [];
			if (skip === 0 && docs.length > 0) {
				migrationLogger.info(
					`Found ${docs.length} document(s) with approvalLevelId (skip=${skip})`,
				);
			} else if (docs.length > 0) {
				migrationLogger.info(`Next batch: ${docs.length} (skip=${skip})`);
			}

			for (const doc of docs) {
				const approvalLevelId = doc.approvalLevelId;
				if (approvalLevelId === undefined || approvalLevelId === null) continue;

				const id = doc._id;
				const idObj = typeof id === "string" ? new ObjectId(id) : id;

				if (dryRun) {
					migrationLogger.info(
						`  [dry-run] Would set approvalTypeId = ${String(approvalLevelId)} and remove approvalLevelId for _id=${id}, workflowId=${doc.workflowId}, level=${doc.level}`,
					);
					totalUpdated++;
					continue;
				}

				try {
					let approvalTypeIdToSet: ObjectId | string = approvalLevelId as string;
					if (
						typeof approvalTypeIdToSet === "string" &&
						/^[0-9a-fA-F]{24}$/.test(approvalTypeIdToSet)
					) {
						approvalTypeIdToSet = new ObjectId(approvalTypeIdToSet);
					}

					await prisma.$runCommandRaw({
						update: COLLECTION,
						updates: [
							{
								q: { _id: idObj },
								u: {
									$set: { approvalTypeId: approvalTypeIdToSet },
									$unset: { approvalLevelId: "" },
								},
								upsert: false,
								multi: false,
							},
						],
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
					} as any);
					totalUpdated++;
				} catch (err) {
					migrationLogger.error(
						`Error updating document ${id} (workflowId=${doc.workflowId}, level=${doc.level}): ${err}`,
					);
					totalErrors++;
				}
			}

			skip += docs.length;
		} while (docs.length === BATCH_SIZE);

		migrationLogger.info("");
		migrationLogger.info("Result:");
		migrationLogger.info(`  Updated: ${totalUpdated}`);
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

migrate()
	.then(() => process.exit(0))
	.catch(() => process.exit(1));
