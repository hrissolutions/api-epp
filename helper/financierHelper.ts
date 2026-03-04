/**
 * Resolve the interest rate (%) for a given installment count using the financier config's
 * installment rate configuration. Example: 3 installments → 1.5%, 6 → 2%, 12 → 3%.
 * Also: get FinancierConfig by userId (WorkflowApprovalLevel.approverId === FinancierConfig.userId).
 */

import type { PrismaClient } from "../generated/prisma";

export type InstallmentRateTier = { installmentCount: number; rate: number };

/**
 * Get the rate for a given installment count from installmentRateConfig.
 * - If a tier with matching installmentCount exists, returns that rate.
 * - Otherwise returns 0.
 */
export function getRateForInstallmentCount(
	installmentCount: number,
	config: {
		installmentRateConfig?: InstallmentRateTier[] | null;
	},
): number {
	const tiers = Array.isArray(config.installmentRateConfig) ? config.installmentRateConfig : [];
	const tier = tiers.find((t) => t.installmentCount === installmentCount);
	if (tier != null && typeof tier.rate === "number") {
		return tier.rate;
	}
	return 0;
}

/**
 * Get active FinancierConfig by userId (e.g. WorkflowApprovalLevel.approverId).
 * Used to detect if an approval level is a "financier" and to use their
 * autoApproveLimit, maxCreditLimit, and installmentRateConfig.
 */
export async function getFinancierConfigByUserId(
	prisma: PrismaClient,
	userId: string,
): Promise<{
	id: string;
	userId: string;
	maxCreditLimit: number;
	autoApproveLimit: number;
	installmentRateConfig: Array<{ installmentCount: number; rate: number }>;
} | null> {
	const config = await prisma.financierConfig.findFirst({
		where: { userId, isActive: true },
		select: {
			id: true,
			userId: true,
			maxCreditLimit: true,
			autoApproveLimit: true,
			installmentRateConfig: true,
		},
	});
	if (!config) return null;
	return config as any;
}

/**
 * Get total used credit for a financier config (sum of principalAmount from
 * FinancingAgreements with status APPROVED, ACTIVE, or COMPLETED).
 * Available credit = maxCreditLimit - usedCredit.
 */
export async function getUsedCreditForFinancierConfig(
	prisma: PrismaClient,
	financierConfigId: string,
): Promise<number> {
	const result = await prisma.financingAgreement.aggregate({
		where: {
			financierConfigId,
			status: { in: ["APPROVED", "ACTIVE", "COMPLETED"] },
		},
		_sum: { principalAmount: true },
	});
	return result._sum.principalAmount ?? 0;
}

/**
 * Get the FinancierConfig for the financier level in a workflow, if any.
 * A workflow level is "financier" when WorkflowApprovalLevel.approverId matches
 * FinancierConfig.userId. Returns the first such config (by level order).
 * Use this when computing installments to apply installmentRateConfig (e.g. 3 → 1.5%, 6 → 2%, 12 → 3%).
 */
export async function getFinancierConfigForWorkflow(
	prisma: PrismaClient,
	workflow: { workflowLevels?: Array<{ approverId: string | null }> },
): Promise<Awaited<ReturnType<typeof getFinancierConfigByUserId>> | null> {
	if (!workflow.workflowLevels?.length) return null;
	for (const wl of workflow.workflowLevels) {
		if (wl.approverId) {
			const config = await getFinancierConfigByUserId(prisma, wl.approverId);
			if (config) return config;
		}
	}
	return null;
}
