import type { Server } from "socket.io";
import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";
import { invalidateCache } from "../middleware/cache";

const logger = getLogger();
const lowStockLogger = logger.child({ module: "lowStockNotification" });

const NOTIFICATION_CATEGORY_LOW_STOCK = "LOW_STOCK";
const SOCKET_EVENT_NOTIFICATION = "notification";

/**
 * If the item's stockQuantity is below lowStockThreshold, create a notification
 * with the item's supplier as recipient (unread) and optionally emit via socket.
 */
export const createLowStockNotificationIfNeeded = async (
	prisma: PrismaClient,
	itemId: string,
	io?: Server,
	organizationId?: string | null,
): Promise<{ created: boolean; notificationId?: string }> => {
	try {
		const item = await prisma.item.findUnique({
			where: { id: itemId },
			select: {
				id: true,
				organizationId: true,
				sku: true,
				name: true,
				stockQuantity: true,
				lowStockThreshold: true,
				supplierId: true,
			},
		});

		if (!item) {
			lowStockLogger.warn(`Item ${itemId} not found for low-stock check`);
			return { created: false };
		}

		if (item.stockQuantity >= item.lowStockThreshold) {
			return { created: false };
		}

		const title = "Low stock alert";
		const description = `"${item.name}" (${item.sku}) is below threshold: ${item.stockQuantity} in stock, threshold is ${item.lowStockThreshold}.`;

		const notification = await prisma.notification.create({
			data: {
				source: item.id,
				category: NOTIFICATION_CATEGORY_LOW_STOCK,
				title,
				description,
				organizationId: organizationId ?? item.organizationId,
				recipients: {
					read: [],
					unread: [{ user: item.supplierId, date: new Date() }],
				},
				metadata: {
					itemId: item.id,
					sku: item.sku,
					name: item.name,
					stockQuantity: item.stockQuantity,
					lowStockThreshold: item.lowStockThreshold,
					supplierId: item.supplierId,
				},
				isDeleted: false,
			} as any,
		});

		lowStockLogger.info(
			`Low-stock notification created for item ${item.id} (${item.sku}), supplier ${item.supplierId}`,
		);

		try {
			await invalidateCache.byPattern("cache:notification:list:*");
		} catch (cacheError) {
			lowStockLogger.warn("Failed to invalidate notification cache:", cacheError);
		}

		if (io) {
			const room = `supplier:${item.supplierId}`;
			io.to(room).emit(SOCKET_EVENT_NOTIFICATION, {
				category: NOTIFICATION_CATEGORY_LOW_STOCK,
				notificationId: notification.id,
				title,
				description,
				metadata: {
					itemId: item.id,
					sku: item.sku,
					name: item.name,
					stockQuantity: item.stockQuantity,
					lowStockThreshold: item.lowStockThreshold,
					supplierId: item.supplierId,
				},
				recipients: notification.recipients,
				createdAt: notification.createdAt,
			});
			lowStockLogger.debug(`Emitted low-stock notification to room ${room}`);
		}

		return { created: true, notificationId: notification.id };
	} catch (error) {
		lowStockLogger.error(`Failed to create low-stock notification for item ${itemId}:`, error);
		return { created: false };
	}
};
