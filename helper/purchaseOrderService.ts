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

/**
 * Create PurchaseOrder(s) for an approved order. One PO per supplier (order items grouped by item.supplierId).
 * Called when the last approver (e.g. FINANCIER) approves a client order (Step 3).
 * Supports orders created from cart checkout (embedded items only) and orders with OrderItem relations.
 */
export const createPurchaseOrdersForApprovedOrder = async (
	prisma: PrismaClient,
	orderId: string,
	approvedBy?: string,
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

	if (order.orderItems.length > 0) {
		// Use OrderItem relation (orders created via order API with orderItems)
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
	} else {
		// Cart checkout orders only have embedded items – build lines from order.items and Item lookup
		const embeddedItems = (order.items as OrderLine[] | null) ?? [];
		if (!Array.isArray(embeddedItems) || embeddedItems.length === 0) {
			poServiceLogger.warn(
				`Order ${orderId} has no order items (embedded or relation), skipping PO creation`,
			);
			return [];
		}
		for (const row of embeddedItems) {
			const itemId = (row as any).itemId;
			if (!itemId) continue;
			const item = await prisma.item.findUnique({
				where: { id: itemId },
				select: { id: true, supplierId: true, sku: true, name: true },
			});
			if (!item) {
				poServiceLogger.warn(`Item ${itemId} not found for order ${orderId}, skipping`);
				continue;
			}
			const sid = item.supplierId;
			if (!bySupplier.has(sid)) {
				bySupplier.set(sid, { supplierId: sid, items: [] });
			}
			bySupplier.get(sid)!.items.push({
				itemId: item.id,
				sku: item.sku,
				description: item.name,
				quantity: (row as any).quantity ?? 0,
				unitPrice: (row as any).unitPrice ?? 0,
			});
		}
		if (bySupplier.size === 0) {
			poServiceLogger.warn(
				`Order ${orderId}: no valid items with supplier, skipping PO creation`,
			);
			return [];
		}
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
			},
		});
		created.push({ id: po.id, poNumber: po.poNumber, supplierId: po.supplierId });
		poServiceLogger.info(
			`Created PO ${po.poNumber} for order ${order.orderNumber}, supplier ${group.supplierId}`,
		);
	}

	return created;
};
