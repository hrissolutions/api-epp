/**
 * Script to add the FINANCIER approval level to WorkflowApprovalLevel for all
 * approval workflows that apply to orders of 1000 or above, and to update
 * existing FINANCIER workflow approval levels with approver details.
 *
 * Usage:
 *   npx ts-node scripts/add-financier-workflow-approval-level.ts
 *
 * Options:
 *   --dry-run              Preview changes without creating/updating records
 *   --approval-level-id ID Use this ApprovalLevel id (default: 69800e5e16324ea0fcba22bc)
 *   --threshold N          Min order amount to consider "1000 above" (default: 1000)
 *   --update-existing      Also update existing FINANCIER workflow levels with null approver fields
 *   --approver-id ID       Financier userId / approverId (default: 697845e3479eaa6d2f796b7d)
 *   --approver-email EMAIL Financier email (default: bryangabrielberja25@gmail.com)
 */

import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";
import { connectAllDatabases, disconnectAllDatabases } from "../config/database";

const logger = getLogger();
const scriptLogger = logger.child({ module: "addFinancierWorkflowApprovalLevel" });

const DEFAULT_FINANCIER_APPROVAL_LEVEL_ID = "69800e5e16324ea0fcba22bc";
const DEFAULT_THRESHOLD = 1000;
const DEFAULT_FINANCIER_APPROVER = {
	approverId: "697845e3479eaa6d2f796b7d",
	approverName: "Financier",
	approverEmail: "bryangabrielberja25@gmail.com",
};

function parseArgs(): {
	dryRun: boolean;
	approvalLevelId: string;
	threshold: number;
	updateExisting: boolean;
	approverId: string;
	approverName: string;
	approverEmail: string;
} {
	const args = process.argv.slice(2);
	let dryRun = false;
	let approvalLevelId = DEFAULT_FINANCIER_APPROVAL_LEVEL_ID;
	let threshold = DEFAULT_THRESHOLD;
	let updateExisting = false;
	let approverId = DEFAULT_FINANCIER_APPROVER.approverId;
	let approverName = DEFAULT_FINANCIER_APPROVER.approverName;
	let approverEmail = DEFAULT_FINANCIER_APPROVER.approverEmail;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--dry-run") dryRun = true;
		if (args[i] === "--update-existing") updateExisting = true;
		if (args[i] === "--approval-level-id" && args[i + 1]) {
			approvalLevelId = args[i + 1];
			i++;
		}
		if (args[i] === "--threshold" && args[i + 1]) {
			const n = parseInt(args[i + 1], 10);
			if (!isNaN(n)) threshold = n;
			i++;
		}
		if (args[i] === "--approver-id" && args[i + 1]) {
			approverId = args[i + 1];
			i++;
		}
		if (args[i] === "--approver-email" && args[i + 1]) {
			approverEmail = args[i + 1];
			i++;
		}
	}

	return {
		dryRun,
		approvalLevelId,
		threshold,
		updateExisting,
		approverId,
		approverName,
		approverEmail,
	};
}

function isValidObjectId(id: string): boolean {
	return /^[0-9a-fA-F]{24}$/.test(id);
}

async function main() {
	const {
		dryRun,
		approvalLevelId,
		threshold,
		updateExisting,
		approverId,
		approverName,
		approverEmail,
	} = parseArgs();
	const prisma = new PrismaClient();

	try {
		await connectAllDatabases();

		scriptLogger.info("============================================================");
		scriptLogger.info("Add FINANCIER to WorkflowApprovalLevel (workflows >= threshold)");
		scriptLogger.info("============================================================");
		scriptLogger.info(`Approval level ID (FINANCIER): ${approvalLevelId}`);
		scriptLogger.info(`Threshold (min order amount): ${threshold}`);
		scriptLogger.info(`Approver: ${approverName} <${approverEmail}> (id: ${approverId})`);
		scriptLogger.info(`Update existing: ${updateExisting}`);
		scriptLogger.info(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
		scriptLogger.info("");

		if (!isValidObjectId(approvalLevelId)) {
			scriptLogger.error(
				`Invalid approval level id: ${approvalLevelId}. Must be 24 hex chars.`,
			);
			process.exit(1);
		}

		// 1) Verify FINANCIER approval level exists
		const financierApprovalLevel = await prisma.approvalLevel.findFirst({
			where: { id: approvalLevelId },
		});
		if (!financierApprovalLevel) {
			scriptLogger.error(
				`Approval level not found: ${approvalLevelId}. Create the FINANCIER approval level first (e.g. via POST /api/approvalLevel).`,
			);
			process.exit(1);
		}
		if (financierApprovalLevel.role !== "FINANCIER") {
			scriptLogger.warn(
				`Approval level ${approvalLevelId} has role "${financierApprovalLevel.role}", not FINANCIER. Continuing anyway.`,
			);
		}
		scriptLogger.info(
			`Found approval level: ${financierApprovalLevel.role} - ${financierApprovalLevel.description ?? "(no description)"}`,
		);

		// 2) Find approval workflows that apply to order total >= threshold
		//    A workflow applies to amount X when: (minOrderAmount is null or X >= minOrderAmount) and (maxOrderAmount is null or X <= maxOrderAmount)
		//    So it applies to "threshold and above" when: (minOrderAmount is null or minOrderAmount <= threshold) AND (maxOrderAmount is null or maxOrderAmount >= threshold)
		const workflows = await prisma.approvalWorkflow.findMany({
			where: {
				isActive: true,
				AND: [
					{ OR: [{ maxOrderAmount: null }, { maxOrderAmount: { gte: threshold } }] },
					{ OR: [{ minOrderAmount: null }, { minOrderAmount: { lte: threshold } }] },
				],
			},
			include: {
				workflowLevels: { orderBy: { level: "asc" } },
			},
		});

		scriptLogger.info(
			`Found ${workflows.length} active workflow(s) that apply to order amount >= ${threshold}.`,
		);

		let created = 0;
		let skipped = 0;

		for (const workflow of workflows) {
			const alreadyHasFinancier = workflow.workflowLevels.some(
				(wl) => wl.approvalLevelId === approvalLevelId,
			);
			if (alreadyHasFinancier) {
				scriptLogger.info(
					`  [SKIP] Workflow "${workflow.name}" (${workflow.id}) already has FINANCIER level.`,
				);
				skipped++;
				continue;
			}

			const nextLevel =
				workflow.workflowLevels.length === 0
					? 1
					: Math.max(...workflow.workflowLevels.map((wl) => wl.level)) + 1;

			scriptLogger.info(
				`  [ADD] Workflow "${workflow.name}" (${workflow.id}): add FINANCIER at level ${nextLevel}.`,
			);

			if (!dryRun) {
				await prisma.workflowApprovalLevel.create({
					data: {
						workflowId: workflow.id,
						approvalLevelId,
						level: nextLevel,
						organizationId: workflow.organizationId ?? null,
						approverId,
						approverName,
						approverEmail,
					},
				});
				created++;
			} else {
				created++;
			}
		}

		// 3) Optionally update existing FINANCIER workflow approval levels that have null approver fields
		let updated = 0;
		if (updateExisting) {
			scriptLogger.info("");
			scriptLogger.info(
				"Updating existing FINANCIER workflow approval levels with approver details...",
			);
			const existingLevels = await prisma.workflowApprovalLevel.findMany({
				where: {
					approvalLevelId,
					OR: [{ approverName: null }, { approverEmail: null }, { approverId: null }],
				},
				include: { workflow: { select: { name: true } } },
			});
			scriptLogger.info(
				`Found ${existingLevels.length} record(s) with null approver fields.`,
			);
			for (const wl of existingLevels) {
				scriptLogger.info(
					`  [UPDATE] Workflow "${wl.workflow.name}" level ${wl.level} (${wl.id}): set approver ${approverName} <${approverEmail}>.`,
				);
				if (!dryRun) {
					await prisma.workflowApprovalLevel.update({
						where: { id: wl.id },
						data: { approverId, approverName, approverEmail },
					});
					updated++;
				} else {
					updated++;
				}
			}
			scriptLogger.info(`Updated: ${updated}.`);
		}

		scriptLogger.info("");
		scriptLogger.info(
			`Done. Created: ${created}, Skipped: ${skipped}${updateExisting ? `, Updated: ${updated}` : ""}.`,
		);
		if (dryRun && (created > 0 || updated > 0)) {
			scriptLogger.info("Run without --dry-run to apply changes.");
		}
	} catch (error) {
		scriptLogger.error("Script failed:", error);
		process.exit(1);
	} finally {
		await disconnectAllDatabases();
		await prisma.$disconnect();
	}
}

main();
