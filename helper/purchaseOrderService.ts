import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";
import { generatePONumber } from "./generate-PONumber.helper";

const logger = getLogger();
const poServiceLogger = logger.child({ module: "purchaseOrderService" });

type OrderLine = {
	itemId: string;
	sku: string;
	description: string;
	quantity: number;
	unitPrice: number;
};

export type PurchaseOrderContactPayload = {
	contactName?: string | null;
	contactDesignation?: string | null;
	contactDepartment?: string | null;
	contactNumber?: string | null;
	contactMobile?: string | null;
	contactEmail?: string | null;
};

/**
 * Create PurchaseOrder(s) for an approved order. One PO per supplier (order items grouped by item.supplierId).
 * Called when the last approver (e.g. FINANCIER) approves a client order (Step 3).
 * Uses `orderItems` (OrderItem relation) as the source of truth.
 */
export const createPurchaseOrdersForApprovedOrder = async (
	prisma: PrismaClient,
	orderId: string,
	approvedBy?: string,
	contactPayload?: PurchaseOrderContactPayload,
): Promise<{ id: string; poNumber: string; supplierId: string }[]> => {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		include: {
			orderItems: {
				include: {
					item: {
						select: { id: true, supplierId: true, sku: true, name: true },
					},
				},
			},
		},
	});

	if (!order) {
		poServiceLogger.warn(`Order not found: ${orderId}`);
		return [];
	}

	const bySupplier = new Map<
		string,
		{
			supplierId: string;
			items: OrderLine[];
		}
	>();

	if (order.orderItems.length === 0) {
		poServiceLogger.warn(`Order ${orderId} has no order items, skipping PO creation`);
		return [];
	}

	for (const oi of order.orderItems) {
		const sid = oi.item.supplierId;
		if (!bySupplier.has(sid)) {
			bySupplier.set(sid, { supplierId: sid, items: [] });
		}
		bySupplier.get(sid)!.items.push({
			itemId: oi.item.id,
			sku: oi.item.sku,
			description: oi.item.name,
			quantity: oi.quantity,
			unitPrice: oi.unitPrice,
		});
	}

	const created: { id: string; poNumber: string; supplierId: string }[] = [];
	const approvedAt = new Date();

	for (const [, group] of bySupplier) {
		const poNumber = await generatePONumber(prisma);
		const po = await prisma.purchaseOrder.create({
			data: {
				organizationId: order.organizationId,
				poNumber,
				orderId: order.id,
				supplierId: group.supplierId,
				status: "PENDING",
				items: group.items as any,
				approvedBy: approvedBy ?? undefined,
				approvedAt,
				...(contactPayload && {
					contactName: contactPayload.contactName ?? undefined,
					contactDesignation: contactPayload.contactDesignation ?? undefined,
					contactDepartment: contactPayload.contactDepartment ?? undefined,
					contactNumber: contactPayload.contactNumber ?? undefined,
					contactMobile: contactPayload.contactMobile ?? undefined,
					contactEmail: contactPayload.contactEmail ?? undefined,
				}),
			},
		});
		created.push({ id: po.id, poNumber: po.poNumber, supplierId: po.supplierId });
		poServiceLogger.info(
			`Created PO ${po.poNumber} for order ${order.orderNumber}, supplier ${group.supplierId}`,
		);
	}

	return created;
};
