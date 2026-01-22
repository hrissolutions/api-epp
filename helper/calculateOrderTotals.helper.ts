import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";

const logger = getLogger();
const calculateTotalsLogger = logger.child({ module: "calculateOrderTotals" });

interface OrderItemInput {
	itemId: string;
	quantity: number;
	unitPrice?: number; // Optional - will be fetched from item if not provided
	discount?: number;
	subtotal?: number;
}

interface CalculatedOrderItem {
	itemId: string;
	quantity: number;
	unitPrice: number;
	discount: number;
	subtotal: number;
}

interface OrderTotals {
	items: CalculatedOrderItem[];
	subtotal: number;
	discount: number;
	tax: number;
	total: number;
}

/**
 * Default tax rate (10%). Can be made configurable later.
 */
const DEFAULT_TAX_RATE = 0.1; // 10%

/**
 * Calculates order totals from items
 * - Fetches item prices (sellingPrice) if unitPrice is not provided in items
 * - Fetches item details to get discount (if available from item)
 * - Calculates item-level subtotals
 * - Calculates order-level totals
 *
 * @param prisma - Prisma client instance
 * @param items - Array of order items (unitPrice is optional - will be fetched from item if not provided)
 * @param taxRate - Optional tax rate (defaults to 10%)
 * @returns Promise<OrderTotals> - Calculated order totals
 */
export const calculateOrderTotals = async (
	prisma: PrismaClient,
	items: OrderItemInput[],
	taxRate: number = DEFAULT_TAX_RATE,
): Promise<OrderTotals> => {
	try {
		const calculatedItems: CalculatedOrderItem[] = [];
		let orderSubtotal = 0;
		let orderDiscount = 0;

		// Process each item
		for (const item of items) {
			// Fetch item to get price (if unitPrice not provided) and discount
			let unitPrice = item.unitPrice;

			if (!unitPrice) {
				// Fetch item to get sellingPrice
				const dbItem = await prisma.item.findFirst({
					where: { id: item.itemId },
					select: { sellingPrice: true, retailPrice: true },
				});

				if (!dbItem) {
					throw new Error(`Item not found with id: ${item.itemId}`);
				}

				// Use sellingPrice if available, otherwise fall back to retailPrice
				unitPrice = dbItem.sellingPrice ?? dbItem.retailPrice ?? 0;

				if (unitPrice === 0) {
					throw new Error(
						`Item ${item.itemId} has no valid price (sellingPrice or retailPrice)`,
					);
				}

				calculateTotalsLogger.info(
					`Fetched price from item ${item.itemId}: ${unitPrice} (sellingPrice: ${dbItem.sellingPrice}, retailPrice: ${dbItem.retailPrice})`,
				);
			}

			// If discount is provided in the item, use it; otherwise default to 0
			const itemDiscount = item.discount ?? 0;

			// Ensure unitPrice is defined
			if (unitPrice === undefined || unitPrice === null) {
				throw new Error(`Unit price is required for item ${item.itemId}`);
			}

			// Calculate item subtotal: (quantity * unitPrice) - discount
			const itemSubtotal = item.quantity * unitPrice - itemDiscount;

			// Ensure subtotal is not negative
			const finalSubtotal = Math.max(0, itemSubtotal);

			calculatedItems.push({
				itemId: item.itemId,
				quantity: item.quantity,
				unitPrice: unitPrice,
				discount: itemDiscount,
				subtotal: finalSubtotal,
			});

			orderSubtotal += finalSubtotal;
			orderDiscount += itemDiscount;

			calculateTotalsLogger.debug(
				`Item ${item.itemId}: qty=${item.quantity}, price=${unitPrice}, discount=${itemDiscount}, subtotal=${finalSubtotal}`,
			);
		}

		// Calculate tax on subtotal (after discounts)
		const tax = orderSubtotal * taxRate;

		// Calculate total: subtotal + tax
		const total = orderSubtotal + tax;

		const totals: OrderTotals = {
			items: calculatedItems,
			subtotal: Math.round(orderSubtotal * 100) / 100, // Round to 2 decimal places
			discount: Math.round(orderDiscount * 100) / 100,
			tax: Math.round(tax * 100) / 100,
			total: Math.round(total * 100) / 100,
		};

		calculateTotalsLogger.info(
			`Calculated order totals: subtotal=${totals.subtotal}, discount=${totals.discount}, tax=${totals.tax}, total=${totals.total}`,
		);

		return totals;
	} catch (error) {
		calculateTotalsLogger.error(`Error calculating order totals: ${error}`);
		throw error;
	}
};
