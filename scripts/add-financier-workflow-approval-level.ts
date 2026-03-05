/**
 * Script: Add FINANCIER to all approval workflows in WorkflowApprovalLevel.
 * - Adds FINANCIER level to every active approval workflow that doesn't already have it.
 * - Optionally updates existing FINANCIER levels with null approver fields (--update-existing).
 *
 * When creating an order: if the approver is a financier and order total <= FinancierConfig.autoApproveLimit
 * (e.g. 5000) and within maxCreditLimit (e.g. 1000000), the OrderApproval is created with status APPROVED
 * (see approvalService.createApprovalChain).
 *
 * Usage:
 *   npx ts-node scripts/add-financier-workflow-approval-level.ts
 *
 * Options:
 *   --dry-run              Preview changes without creating records
 *   --approval-type-id ID  Use this ApprovalType id (default: 69800e5e16324ea0fcba22bc)
 *   --update-existing      Also update existing FINANCIER workflow levels with null approver fields
 *   --approver-id ID       Financier userId / approverId (default: 697845e3479eaa6d2f796b7d)
 *   --approver-email EMAIL Financier email (default: bryangabrielberja25@gmail.com)
 */

import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";
import { connectAllDatabases, disconnectAllDatabases } from "../config/database";

const logger = getLogger();
const scriptLogger = logger.child({ module: "addFinancierWorkflowApprovalLevel" });

const DEFAULT_FINANCIER_APPROVAL_TYPE_ID = "69800e5e16324ea0fcba22bc";
const DEFAULT_FINANCIER_APPROVER = {
	approverId: "697845e3479eaa6d2f796b7d",
	approverName: "Financier",
	approverEmail: "bryangabrielberja25@gmail.com",
};

function parseArgs(): {
	dryRun: boolean;
	approvalTypeId: string;
	updateExisting: boolean;
	approverId: string;
	approverName: string;
	approverEmail: string;
} {
	const args = process.argv.slice(2);
	let dryRun = false;
	let approvalTypeId = DEFAULT_FINANCIER_APPROVAL_TYPE_ID;
	let updateExisting = false;
	let approverId = DEFAULT_FINANCIER_APPROVER.approverId;
	let approverName = DEFAULT_FINANCIER_APPROVER.approverName;
	let approverEmail = DEFAULT_FINANCIER_APPROVER.approverEmail;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--dry-run") dryRun = true;
		if (args[i] === "--update-existing") updateExisting = true;
		if (args[i] === "--approval-type-id" && args[i + 1]) {
			approvalTypeId = args[i + 1];
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
		approvalTypeId,
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
	const { dryRun, approvalTypeId, updateExisting, approverId, approverName, approverEmail } =
		parseArgs();
	const prisma = new PrismaClient();

	try {
		await connectAllDatabases();

		scriptLogger.info("============================================================");
		scriptLogger.info("Add FINANCIER to all approval workflows (WorkflowApprovalLevel)");
		scriptLogger.info("============================================================");
		scriptLogger.info(`Approval type ID (FINANCIER): ${approvalTypeId}`);
		scriptLogger.info(`Approver: ${approverName} <${approverEmail}> (id: ${approverId})`);
		scriptLogger.info(`Update existing: ${updateExisting}`);
		scriptLogger.info(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
		scriptLogger.info("");

		if (!isValidObjectId(approvalTypeId)) {
			scriptLogger.error(
				`Invalid approval type id: ${approvalTypeId}. Must be 24 hex chars.`,
			);
			process.exit(1);
		}

		// 1) Verify FINANCIER approval type exists
		const financierApprovalType = await prisma.approvalType.findFirst({
			where: { id: approvalTypeId },
		});
		if (!financierApprovalType) {
			scriptLogger.error(
				`Approval type not found: ${approvalTypeId}. Create the FINANCIER approval type first (e.g. via POST /api/approvalType).`,
			);
			process.exit(1);
		}
		if (financierApprovalType.role !== "FINANCIER") {
			scriptLogger.warn(
				`Approval type ${approvalTypeId} has role "${financierApprovalType.role}", not FINANCIER. Continuing anyway.`,
			);
		}
		scriptLogger.info(
			`Found approval type: ${financierApprovalType.role} - ${financierApprovalType.description ?? "(no description)"}`,
		);

		// 2) ADD: Add FINANCIER to all active approval workflows that don't already have it
		scriptLogger.info("");
		scriptLogger.info("Adding FINANCIER to all active workflows (if missing)...");
		const workflows = await prisma.approvalWorkflow.findMany({
			where: { isActive: true },
			include: {
				workflowLevels: { orderBy: { level: "asc" } },
			},
		});

		scriptLogger.info(`Found ${workflows.length} active workflow(s).`);

		let created = 0;
		let skipped = 0;

		for (const workflow of workflows) {
			const alreadyHasFinancier = workflow.workflowLevels.some(
				(wl) => wl.approvalTypeId === approvalTypeId,
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
						approvalTypeId,
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
					approvalTypeId,
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
