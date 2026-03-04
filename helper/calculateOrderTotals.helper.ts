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
 * Resolves the correct price field to use based on user type.
 *
 * Price hierarchy (lowest → highest): supplierPrice < employeePrice < standardPrice < srp
 *
 * - EMPLOYEE              → employeePrice  (EPP employee rate)
 * - WHOLESALER            → wholesalePrice (bulk buyer rate)
 * - RETAILER / INDIVIDUAL → standardPrice  (regular user rate)
 * - ADMIN / FINANCIER / VENDOR / fallback → supplierPrice (Uzaro cost price)
 */
function resolvePriceForUserType(
	userType: string | undefined,
	item: {
		srp: number;
		supplierPrice: number | null;
		employeePrice: number | null;
		wholesalePrice: number | null;
		standardPrice: number | null;
	},
): { price: number; field: string } {
	const type = userType ?? "EMPLOYEE";

	if (type === "EMPLOYEE") {
		// Prefer employeePrice; fall back to supplierPrice then srp
		if (item.employeePrice != null) return { price: item.employeePrice, field: "employeePrice" };
		if (item.supplierPrice != null) return { price: item.supplierPrice, field: "supplierPrice" };
		return { price: item.srp, field: "srp" };
	}

	if (type === "WHOLESALER") {
		if (item.wholesalePrice != null) return { price: item.wholesalePrice, field: "wholesalePrice" };
		return { price: item.srp, field: "srp" };
	}

	if (type === "RETAILER" || type === "INDIVIDUAL") {
		if (item.standardPrice != null) return { price: item.standardPrice, field: "standardPrice" };
		return { price: item.srp, field: "srp" };
	}

	// ADMIN / FINANCIER / VENDOR — cost price
	if (item.supplierPrice != null) return { price: item.supplierPrice, field: "supplierPrice" };
	return { price: item.srp, field: "srp" };
}

/**
 * Calculates order totals from items.
 * - Selects the correct unit price based on userType when unitPrice is not explicitly provided
 * - Calculates item-level subtotals
 * - Calculates order-level totals
 *
 * @param prisma    - Prisma client instance
 * @param items     - Array of order items (unitPrice is optional)
 * @param userType  - User type determining which price field to use
 * @returns Promise<OrderTotals>
 */
export const calculateOrderTotals = async (
	prisma: PrismaClient,
	items: OrderItemInput[],
	userType?: string,
): Promise<OrderTotals> => {
	try {
		const calculatedItems: CalculatedOrderItem[] = [];
		let orderSubtotal = 0;
		let orderDiscount = 0;

		// Process each item
		for (const item of items) {
			let unitPrice = item.unitPrice;

			if (!unitPrice) {
				const dbItem = await prisma.item.findFirst({
					where: { id: item.itemId },
					select: {
						srp: true,
						supplierPrice: true,
						employeePrice: true,
						wholesalePrice: true,
						standardPrice: true,
					},
				});

				if (!dbItem) {
					throw new Error(`Item not found with id: ${item.itemId}`);
				}

				const resolved = resolvePriceForUserType(userType, dbItem);
				unitPrice = resolved.price;

				if (!unitPrice || unitPrice === 0) {
					throw new Error(
						`Item ${item.itemId} has no valid price for userType "${userType ?? "EMPLOYEE"}"`,
					);
				}

				calculateTotalsLogger.info(
					`Fetched price for item ${item.itemId}: ${unitPrice} (field: ${resolved.field}, userType: ${userType ?? "EMPLOYEE"})`,
				);
			}

			const itemDiscount = item.discount ?? 0;

			if (unitPrice === undefined || unitPrice === null) {
				throw new Error(`Unit price is required for item ${item.itemId}`);
			}

			const itemSubtotal = item.quantity * unitPrice - itemDiscount;
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

		const tax = 0;
		const total = orderSubtotal;

		const totals: OrderTotals = {
			items: calculatedItems,
			subtotal: Math.round(orderSubtotal * 100) / 100,
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
