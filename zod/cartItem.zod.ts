import { z } from "zod";
import { isValidObjectId } from "mongoose";

// CartItem Schema (full, including ID)
export const CartItemSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	employeeId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid employeeId ObjectId format",
	}),
	itemId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid itemId ObjectId format",
	}),
	quantity: z.number().int().min(1).default(1),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type CartItem = z.infer<typeof CartItemSchema>;

// Create CartItem Schema (excluding ID, createdAt, updatedAt)
export const CreateCartItemSchema = CartItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	quantity: true,
}).extend({
	organizationId: z.string().refine((val) => !val || isValidObjectId(val), {
		message: "Invalid organizationId ObjectId format",
	}).optional().nullable(),
});

export type CreateCartItem = z.infer<typeof CreateCartItemSchema>;

// Update CartItem Schema (partial, excluding immutable fields)
export const UpdateCartItemSchema = CartItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateCartItem = z.infer<typeof UpdateCartItemSchema>;
