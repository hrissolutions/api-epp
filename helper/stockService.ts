import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";

const logger = getLogger();
const stockLogger = logger.child({ module: "stockService" });

/**
 * Deduct stock for items in an order
 */
export const deductStockForOrder = async (prisma: PrismaClient, orderId: string): Promise<void> => {
	try {
		const order = await prisma.order.findFirst({
			where: { id: orderId },
		});

		if (!order) {
			throw new Error(`Order ${orderId} not found`);
		}

		// Items are now embedded in the order (handle null for backward compatibility)
		const items = (order.items as any) || [];
		if (!Array.isArray(items) || items.length === 0) {
			stockLogger.warn(`Order ${orderId} has no items`);
			return;
		}

		for (const item of items) {
			const dbItem = await prisma.item.findFirst({
				where: { id: item.itemId },
			});

			if (!dbItem) {
				stockLogger.warn(`Item ${item.itemId} not found for order ${orderId}`);
				continue;
			}

			const currentStock = dbItem.stockQuantity;
			const quantityOrdered = item.quantity;
			const newStock = Math.max(0, currentStock - quantityOrdered);

			await prisma.item.update({
				where: { id: item.itemId },
				data: {
					stockQuantity: newStock,
				},
			});

			stockLogger.info(
				`Stock deducted for item ${item.itemId} (${dbItem.name}): ` +
					`${currentStock} → ${newStock} (ordered: ${quantityOrdered})`,
			);
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
		});

		if (!order) {
			throw new Error(`Order ${orderId} not found`);
		}

		// Items are now embedded in the order
		const items = (order.items as any) || [];
		if (!Array.isArray(items) || items.length === 0) {
			return [];
		}

		const insufficientStock: Array<{
			itemId: string;
			itemName: string;
			requestedQuantity: number;
			availableStock: number;
			shortage: number;
		}> = [];

		for (const item of items) {
			const dbItem = await prisma.item.findFirst({
				where: { id: item.itemId },
			});

			if (!dbItem) {
				stockLogger.warn(`Item ${item.itemId} not found for order ${orderId}`);
				continue;
			}

			const availableStock = dbItem.stockQuantity;
			const requestedQuantity = item.quantity;

			if (availableStock < requestedQuantity) {
				insufficientStock.push({
					itemId: item.itemId,
					itemName: dbItem.name || "Unknown Item",
					requestedQuantity: requestedQuantity,
					availableStock: availableStock,
					shortage: requestedQuantity - availableStock,
				});

				stockLogger.warn(
					`Insufficient stock for item ${item.itemId} (${dbItem.name}): ` +
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
 * Restore stock for items in an order (when order is cancelled/rejected after approval)
 */
export const restoreStockForOrder = async (
	prisma: PrismaClient,
	orderId: string,
): Promise<void> => {
	try {
		const order = await prisma.order.findFirst({
			where: { id: orderId },
		});

		if (!order) {
			throw new Error(`Order ${orderId} not found`);
		}

		// Items are now embedded in the order (handle null for backward compatibility)
		const items = (order.items as any) || [];
		if (!Array.isArray(items) || items.length === 0) {
			stockLogger.warn(`Order ${orderId} has no items`);
			return;
		}

		for (const item of items) {
			const dbItem = await prisma.item.findFirst({
				where: { id: item.itemId },
			});

			if (!dbItem) {
				stockLogger.warn(`Item ${item.itemId} not found for order ${orderId}`);
				continue;
			}

			const currentStock = dbItem.stockQuantity;
			const quantityToRestore = item.quantity;
			const newStock = currentStock + quantityToRestore;

			await prisma.item.update({
				where: { id: item.itemId },
				data: {
					stockQuantity: newStock,
				},
			});

			stockLogger.info(
				`Stock restored for item ${item.itemId} (${dbItem.name}): ` +
					`${currentStock} → ${newStock} (restored: ${quantityToRestore})`,
			);
		}

		stockLogger.info(`Stock restored for all items in order ${orderId}`);
	} catch (error) {
		stockLogger.error(`Failed to restore stock for order ${orderId}:`, error);
		throw error;
	}
};
