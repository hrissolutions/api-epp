import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";

const logger = getLogger();
const financeSettlementLogger = logger.child({ module: "financeSettlementService" });

function sumPOItems(items: unknown): number {
	if (!Array.isArray(items)) return 0;
	return items.reduce((sum, row: any) => {
		const qty = Number(row?.quantity ?? 0);
		const unitPrice = Number(row?.unitPrice ?? 0);
		if (Number.isNaN(qty) || Number.isNaN(unitPrice)) return sum;
		return sum + qty * unitPrice;
	}, 0);
}

/**
 * Create pending financier disbursement record once a financing agreement is approved.
 */
export const createFinancierDisbursementForAgreement = async (
	prisma: PrismaClient,
	financingAgreementId: string,
): Promise<void> => {
	const agreement = await prisma.financingAgreement.findFirst({
		where: { id: financingAgreementId },
		include: { order: { select: { orderNumber: true } } },
	});
	if (!agreement) return;

	const existing = await prisma.financierDisbursement.findFirst({
		where: { financingAgreementId: agreement.id },
		select: { id: true },
	});
	if (existing) return;

	await prisma.financierDisbursement.create({
		data: {
			organizationId: agreement.organizationId,
			orderId: agreement.orderId,
			financingAgreementId: agreement.id,
			financierConfigId: agreement.financierConfigId,
			amount: agreement.principalAmount,
			currency: "PHP",
			expectedAt: agreement.approvedAt ?? new Date(),
			status: "PENDING",
			reconciliationStatus: "PENDING",
			metadata: {
				orderNumber: agreement.order.orderNumber,
				source: "auto-from-financing-agreement",
			},
		},
	});
	financeSettlementLogger.info(
		`Created pending financier disbursement for agreement ${agreement.id}`,
	);
};

/**
 * Create pending supplier settlement record once PO is created.
 * If order has a financier disbursement, link it.
 */
export const createSupplierSettlementForPO = async (
	prisma: PrismaClient,
	purchaseOrderId: string,
): Promise<void> => {
	const po = await prisma.purchaseOrder.findFirst({
		where: { id: purchaseOrderId },
		include: {
			order: { include: { financingAgreement: true } },
		},
	});
	if (!po) return;

	const existing = await prisma.supplierSettlement.findFirst({
		where: { purchaseOrderId: po.id },
		select: { id: true },
	});
	if (existing) return;

	const amount = sumPOItems(po.items);
	const disbursement = po.order.financingAgreement
		? await prisma.financierDisbursement.findFirst({
				where: { financingAgreementId: po.order.financingAgreement.id },
				orderBy: { createdAt: "desc" },
				select: { id: true },
			})
		: null;

	await prisma.supplierSettlement.create({
		data: {
			organizationId: po.organizationId,
			orderId: po.orderId,
			purchaseOrderId: po.id,
			supplierId: po.supplierId,
			financierDisbursementId: disbursement?.id,
			amount,
			currency: "PHP",
			status: "PENDING",
			reconciliationStatus: "PENDING",
			metadata: {
				poNumber: po.poNumber,
				source: "auto-from-purchase-order",
			},
		},
	});
	financeSettlementLogger.info(`Created pending supplier settlement for PO ${po.poNumber}`);
};

