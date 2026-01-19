import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";

const logger = getLogger();
const calculateTotalsLogger = logger.child({ module: "calculateOrderTotals" });

interface OrderItemInput {
	productId: string;
	quantity: number;
	unitPrice?: number; // Optional - will be fetched from product if not provided
	discount?: number;
	subtotal?: number;
}

interface CalculatedOrderItem {
	productId: string;
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
const DEFAULT_TAX_RATE = 0.10; // 10%

/**
 * Calculates order totals from items
 * - Fetches product prices (employeePrice) if unitPrice is not provided in items
 * - Fetches product details to get discount (if available from product)
 * - Calculates item-level subtotals
 * - Calculates order-level totals
 * 
 * @param prisma - Prisma client instance
 * @param items - Array of order items (unitPrice is optional - will be fetched from product if not provided)
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
			// Fetch product to get price (if unitPrice not provided) and discount
			let unitPrice = item.unitPrice;
			
			if (!unitPrice) {
				// Fetch product to get employeePrice
				const product = await prisma.product.findFirst({
					where: { id: item.productId },
					select: { employeePrice: true, retailPrice: true },
				});

				if (!product) {
					throw new Error(`Product not found with id: ${item.productId}`);
				}

				// Use employeePrice if available, otherwise fall back to retailPrice
				unitPrice = product.employeePrice ?? product.retailPrice ?? 0;

				if (unitPrice === 0) {
					throw new Error(
						`Product ${item.productId} has no valid price (employeePrice or retailPrice)`,
					);
				}

				calculateTotalsLogger.info(
					`Fetched price from product ${item.productId}: ${unitPrice} (employeePrice: ${product.employeePrice}, retailPrice: ${product.retailPrice})`,
				);
			}

			// If discount is provided in the item, use it; otherwise default to 0
			const itemDiscount = item.discount ?? 0;

			// Calculate item subtotal: (quantity * unitPrice) - discount
			const itemSubtotal = item.quantity * unitPrice - itemDiscount;

			// Ensure subtotal is not negative
			const finalSubtotal = Math.max(0, itemSubtotal);

			calculatedItems.push({
				productId: item.productId,
				quantity: item.quantity,
				unitPrice: unitPrice,
				discount: itemDiscount,
				subtotal: finalSubtotal,
			});

			orderSubtotal += finalSubtotal;
			orderDiscount += itemDiscount;

			calculateTotalsLogger.debug(
				`Item ${item.productId}: qty=${item.quantity}, price=${unitPrice}, discount=${itemDiscount}, subtotal=${finalSubtotal}`,
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
