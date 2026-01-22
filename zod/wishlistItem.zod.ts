import { z } from "zod";
import { isValidObjectId } from "mongoose";

// WishlistItem Schema (full, including ID)
export const WishlistItemSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	employeeId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid employeeId ObjectId format",
	}),
	itemId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid itemId ObjectId format",
	}),
	createdAt: z.coerce.date(),
});

export type WishlistItem = z.infer<typeof WishlistItemSchema>;

// Create WishlistItem Schema (excluding ID, createdAt)
export const CreateWishlistItemSchema = WishlistItemSchema.omit({
	id: true,
	createdAt: true,
});

export type CreateWishlistItem = z.infer<typeof CreateWishlistItemSchema>;

// Update WishlistItem Schema (partial, excluding immutable fields)
export const UpdateWishlistItemSchema = WishlistItemSchema.omit({
	id: true,
	createdAt: true,
}).partial();

export type UpdateWishlistItem = z.infer<typeof UpdateWishlistItemSchema>;
