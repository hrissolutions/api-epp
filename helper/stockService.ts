import type { Server } from "socket.io";
import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";
import { createLowStockNotificationIfNeeded } from "./lowStockNotificationService";

const logger = getLogger();
const stockLogger = logger.child({ module: "stockService" });

/**
 * Deduct stock for items in an order.
 * Optionally creates low-stock notifications and emits to supplier socket room when io is provided.
 */
export const deductStockForOrder = async (
	prisma: PrismaClient,
	orderId: string,
	io?: Server,
): Promise<void> => {
	try {
		const order = await prisma.order.findFirst({
			where: { id: orderId },
			include: { orderItems: true },
		});

		if (!order) {
			throw new Error(`Order ${orderId} not found`);
		}

		const orderItems = order.orderItems ?? [];
		if (!Array.isArray(orderItems) || orderItems.length === 0) {
			stockLogger.warn(`Order ${orderId} has no orderItems`);
			return;
		}

		for (const oi of orderItems) {
			const dbItem = await prisma.item.findFirst({
				where: { id: oi.itemId },
			});

			if (!dbItem) {
				stockLogger.warn(`Item ${oi.itemId} not found for order ${orderId}`);
				continue;
			}

			const currentStock = dbItem.stockQuantity;
			const quantityOrdered = oi.quantity;
			const newStock = Math.max(0, currentStock - quantityOrdered);

			await prisma.item.update({
				where: { id: oi.itemId },
				data: {
					stockQuantity: newStock,
				},
			});

			stockLogger.info(
				`Stock deducted for item ${oi.itemId} (${dbItem.name}): ` +
					`${currentStock} → ${newStock} (ordered: ${quantityOrdered})`,
			);

			await createLowStockNotificationIfNeeded(prisma, oi.itemId, io);
		}

		stockLogger.info(`Stock deducted for all items in order ${orderId}`);
	} catch (error) {
		stockLogger.error(`Failed to deduct stock for order ${orderId}:`, error);
		throw error;
	}
};

/**
 * Validate stock availability for all items in an order
 * Returns array of items with insufficient stock
 */
export const validateStockForOrder = async (
	prisma: PrismaClient,
	orderId: string,
): Promise<
	Array<{
		itemId: string;
		itemName: string;
		requestedQuantity: number;
		availableStock: number;
		shortage: number;
	}>
> => {
	try {
		const order = await prisma.order.findFirst({
			where: { id: orderId },
			include: { orderItems: true },
		});

		if (!order) {
			throw new Error(`Order ${orderId} not found`);
		}

		const orderItems = order.orderItems ?? [];
		if (!Array.isArray(orderItems) || orderItems.length === 0) {
			return [];
		}

		const insufficientStock: Array<{
			itemId: string;
			itemName: string;
			requestedQuantity: number;
			availableStock: number;
			shortage: number;
		}> = [];

		for (const oi of orderItems) {
			const dbItem = await prisma.item.findFirst({
				where: { id: oi.itemId },
			});

			if (!dbItem) {
				stockLogger.warn(`Item ${oi.itemId} not found for order ${orderId}`);
				continue;
			}

			const availableStock = dbItem.stockQuantity;
			const requestedQuantity = oi.quantity;

			if (availableStock < requestedQuantity) {
				insufficientStock.push({
					itemId: oi.itemId,
					itemName: dbItem.name || "Unknown Item",
					requestedQuantity: requestedQuantity,
					availableStock: availableStock,
					shortage: requestedQuantity - availableStock,
				});

				stockLogger.warn(
					`Insufficient stock for item ${oi.itemId} (${dbItem.name}): ` +
						`Available: ${availableStock}, Requested: ${requestedQuantity}, Shortage: ${requestedQuantity - availableStock}`,
				);
			}
		}

		if (insufficientStock.length > 0) {
			stockLogger.warn(
				`Order ${orderId} has ${insufficientStock.length} items with insufficient stock`,
			);
		}

		return insufficientStock;
	} catch (error) {
		stockLogger.error(`Failed to validate stock for order ${orderId}:`, error);
		throw error;
	}
};

/**
 * Restore stock for items in an order (when order is cancelled/rejected after approval).
 * Optionally creates low-stock notifications and emits to supplier socket room when io is provided.
 */
export const restoreStockForOrder = async (
	prisma: PrismaClient,
	orderId: string,
	io?: Server,
): Promise<void> => {
	try {
		const order = await prisma.order.findFirst({
			where: { id: orderId },
			include: { orderItems: true },
		});

		if (!order) {
			throw new Error(`Order ${orderId} not found`);
		}

		const orderItems = order.orderItems ?? [];
		if (!Array.isArray(orderItems) || orderItems.length === 0) {
			stockLogger.warn(`Order ${orderId} has no orderItems`);
			return;
		}

		for (const oi of orderItems) {
			const dbItem = await prisma.item.findFirst({
				where: { id: oi.itemId },
			});

			if (!dbItem) {
				stockLogger.warn(`Item ${oi.itemId} not found for order ${orderId}`);
				continue;
			}

			const currentStock = dbItem.stockQuantity;
			const quantityToRestore = oi.quantity;
			const newStock = currentStock + quantityToRestore;

			await prisma.item.update({
				where: { id: oi.itemId },
				data: {
					stockQuantity: newStock,
				},
			});

			stockLogger.info(
				`Stock restored for item ${oi.itemId} (${dbItem.name}): ` +
					`${currentStock} → ${newStock} (restored: ${quantityToRestore})`,
			);

			await createLowStockNotificationIfNeeded(prisma, oi.itemId, io);
		}

		stockLogger.info(`Stock restored for all items in order ${orderId}`);
	} catch (error) {
		stockLogger.error(`Failed to restore stock for order ${orderId}:`, error);
		throw error;
	}
};
