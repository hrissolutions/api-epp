import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Decimal schema helper (for Prisma Float type)
const decimalSchema = z.union([
	z.string().regex(/^\d+\.?\d*$/, "Invalid decimal format"),
	z.number(),
]).transform((val) => {
	if (typeof val === "string") {
		return parseFloat(val);
	}
	return val;
});

// OrderItem Schema (full, including ID)
export const OrderItemSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	orderId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid orderId ObjectId format",
	}),
	productId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid productId ObjectId format",
	}),
	quantity: z.number().int().min(1, "Quantity must be at least 1"),
	unitPrice: decimalSchema,
	discount: decimalSchema.default(0),
	subtotal: decimalSchema,
	createdAt: z.coerce.date(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

// Create OrderItem Schema (excluding ID, createdAt)
export const CreateOrderItemSchema = OrderItemSchema.omit({
	id: true,
	createdAt: true,
}).partial({
	discount: true,
});

export type CreateOrderItem = z.infer<typeof CreateOrderItemSchema>;

// Update OrderItem Schema (partial, excluding immutable fields)
export const UpdateOrderItemSchema = OrderItemSchema.omit({
	id: true,
	createdAt: true,
}).partial();

export type UpdateOrderItem = z.infer<typeof UpdateOrderItemSchema>;
