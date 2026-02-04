import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Supplier Schema (full, including ID)
export const SupplierSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	name: z.string().min(1, "Supplier name is required"),
	code: z.string().min(1, "Supplier code is required"),
	description: z.string().optional().nullable(),
	contactName: z.string().optional().nullable(),
	email: z.string().email("Invalid email format").optional().nullable(),
	phone: z.string().optional().nullable(),
	website: z.string().url("Invalid URL format").optional().nullable(),
	isActive: z.boolean().default(true),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Supplier = z.infer<typeof SupplierSchema>;

// Create Supplier Schema (excluding ID, createdAt, updatedAt)
export const CreateSupplierSchema = SupplierSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
})
	.partial({
		description: true,
		contactName: true,
		email: true,
		phone: true,
		website: true,
		isActive: true,
	})
	.extend({
		organizationId: z
			.string()
			.refine((val) => !val || isValidObjectId(val), {
				message: "Invalid organizationId ObjectId format",
			})
			.optional()
			.nullable(),
	});

export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;

// Update Supplier Schema (partial, excluding immutable fields)
export const UpdateSupplierSchema = SupplierSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateSupplier = z.infer<typeof UpdateSupplierSchema>;
