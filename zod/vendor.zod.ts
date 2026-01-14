import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Vendor Schema (full, including ID)
export const VendorSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	name: z.string().min(1, "Vendor name is required"),
	code: z.string().min(1, "Vendor code is required"),
	description: z.string().optional().nullable(),
	contactName: z.string().optional().nullable(),
	email: z.string().email("Invalid email format").optional().nullable(),
	phone: z.string().optional().nullable(),
	website: z.string().url("Invalid URL format").optional().nullable(),
	isActive: z.boolean().default(true),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Vendor = z.infer<typeof VendorSchema>;

// Create Vendor Schema (excluding ID, createdAt, updatedAt)
export const CreateVendorSchema = VendorSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	contactName: true,
	email: true,
	phone: true,
	website: true,
	isActive: true,
});

export type CreateVendor = z.infer<typeof CreateVendorSchema>;

// Update Vendor Schema (partial, excluding immutable fields)
export const UpdateVendorSchema = VendorSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateVendor = z.infer<typeof UpdateVendorSchema>;
