import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";
import { generatePONumber } from "./generate-PONumber.helper";

const logger = getLogger();
const poServiceLogger = logger.child({ module: "purchaseOrderService" });

/**
 * Create PurchaseOrder(s) for an approved order. One PO per vendor (order items grouped by item.vendorId).
 * Called when Admin approves a client order (Step 3).
 */
export const createPurchaseOrdersForApprovedOrder = async (
	prisma: PrismaClient,
	orderId: string,
	approvedBy?: string,
): Promise<{ id: string; poNumber: string; vendorId: string }[]> => {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		include: {
			orderItems: {
				include: {
					item: {
						select: { id: true, vendorId: true, sku: true, name: true },
					},
				},
			},
		},
	});

	if (!order) {
		poServiceLogger.warn(`Order not found: ${orderId}`);
		return [];
	}

	if (order.orderItems.length === 0) {
		poServiceLogger.warn(`Order ${orderId} has no order items, skipping PO creation`);
		return [];
	}

	// Group order items by vendorId
	const byVendor = new Map<
		string,
		{
			vendorId: string;
			items: {
				itemId: string;
				sku: string;
				description: string;
				quantity: number;
				unitPrice: number;
			}[];
		}
	>();

	for (const oi of order.orderItems) {
		const vid = oi.item.vendorId;
		if (!byVendor.has(vid)) {
			byVendor.set(vid, {
				vendorId: vid,
				items: [],
			});
		}
		byVendor.get(vid)!.items.push({
			itemId: oi.item.id,
			sku: oi.item.sku,
			description: oi.item.name,
			quantity: oi.quantity,
			unitPrice: oi.unitPrice,
		});
	}

	const created: { id: string; poNumber: string; vendorId: string }[] = [];
	const approvedAt = new Date();

	for (const [, group] of byVendor) {
		const poNumber = await generatePONumber(prisma);
		const po = await prisma.purchaseOrder.create({
			data: {
				organizationId: order.organizationId,
				poNumber,
				orderId: order.id,
				vendorId: group.vendorId,
				status: "PENDING",
				items: group.items as any,
				approvedBy: approvedBy ?? undefined,
				approvedAt,
			},
		});
		created.push({ id: po.id, poNumber: po.poNumber, vendorId: po.vendorId });
		poServiceLogger.info(
			`Created PO ${po.poNumber} for order ${order.orderNumber}, vendor ${group.vendorId}`,
		);
	}

	return created;
};
