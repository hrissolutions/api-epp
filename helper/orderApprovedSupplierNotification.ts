import type { Server } from "socket.io";
import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";
import { invalidateCache } from "../middleware/cache";

const logger = getLogger();
const notifLogger = logger.child({ module: "orderApprovedSupplierNotification" });

const CATEGORY_ORDER_APPROVED_SUPPLIER = "ORDER_APPROVED_SUPPLIER";
const SOCKET_EVENT_NOTIFICATION = "notification";

/**
 * When an order is approved, notify each supplier that has items in the order.
 * Creates one notification per supplier with that supplier as recipient (unread)
 * and optionally emits to supplier socket room.
 */
export const createOrderApprovedSupplierNotifications = async (
	prisma: PrismaClient,
	orderId: string,
	io?: Server,
	organizationId?: string | null,
): Promise<{ count: number }> => {
	try {
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			include: {
				orderItems: {
					include: {
						item: {
							select: { supplierId: true, name: true, sku: true },
						},
					},
				},
			},
		});

		if (!order) {
			notifLogger.warn(`Order ${orderId} not found for supplier notifications`);
			return { count: 0 };
		}

		if (order.status !== "APPROVED" && !order.isFullyApproved) {
			return { count: 0 };
		}

		const supplierIds = [
			...new Set(
				order.orderItems
					.map((oi) => oi.item?.supplierId)
					.filter((id): id is string => !!id),
			),
		];

		if (supplierIds.length === 0) {
			notifLogger.debug(`Order ${order.orderNumber} has no items with supplier, skipping`);
			return { count: 0 };
		}

		let created = 0;
		for (const supplierId of supplierIds) {
			const itemsFromSupplier = order.orderItems.filter(
				(oi) => oi.item?.supplierId === supplierId,
			);
			const itemCount = itemsFromSupplier.length;
			const title = "Order approved";
			const description = `Order ${order.orderNumber} has been approved and includes ${itemCount} item(s) from your catalog.`;

			const notification = await prisma.notification.create({
				data: {
					source: order.id,
					category: CATEGORY_ORDER_APPROVED_SUPPLIER,
					title,
					description,
					organizationId: organizationId ?? order.organizationId,
					recipients: {
						read: [],
						unread: [{ user: supplierId, date: new Date() }],
					},
					metadata: {
						orderId: order.id,
						orderNumber: order.orderNumber,
						supplierId,
						itemCount,
						approvedAt: order.approvedAt,
						itemIds: itemsFromSupplier.map((oi) => oi.itemId),
					},
					isDeleted: false,
				} as any,
			});

			created++;
			notifLogger.info(
				`Order-approved notification created for supplier ${supplierId}, order ${order.orderNumber}`,
			);

			if (io) {
				const room = `supplier:${supplierId}`;
				io.to(room).emit(SOCKET_EVENT_NOTIFICATION, {
					category: CATEGORY_ORDER_APPROVED_SUPPLIER,
					notificationId: notification.id,
					title,
					description,
					metadata: notification.metadata,
					recipients: notification.recipients,
					createdAt: notification.createdAt,
				});
				notifLogger.debug(`Emitted order-approved notification to room ${room}`);
			}
		}

		if (created > 0) {
			try {
				await invalidateCache.byPattern("cache:notification:list:*");
			} catch (cacheError) {
				notifLogger.warn("Failed to invalidate notification cache:", cacheError);
			}
		}

		return { count: created };
	} catch (error) {
		notifLogger.error(`Failed to create order-approved supplier notifications for ${orderId}:`, error);
		return { count: 0 };
	}
};
