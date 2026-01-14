import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Enums
export const ProductImageTypeEnum = z.enum([
	"COVER",
	"FEATURED",
	"GALLERY",
	"THUMBNAIL",
	"PACKAGING",
	"DETAIL",
	"LIFESTYLE",
	"SIZE_CHART",
	"INSTRUCTION",
	"OTHER",
]);

export type ProductImageType = z.infer<typeof ProductImageTypeEnum>;

// ProductImage schema - Keep same format (url, type, name)
export const ProductImageSchema = z.object({
	name: z.string().optional().nullable(),
	url: z.string().url().optional().nullable(),
	type: ProductImageTypeEnum.optional().nullable(),
});

export type ProductImage = z.infer<typeof ProductImageSchema>;

// Decimal schema helper (for Prisma Decimal type)
const decimalSchema = z.union([
	z.string().regex(/^\d+\.?\d*$/, "Invalid decimal format"),
	z.number(),
]).transform((val) => {
	if (typeof val === "string") {
		return parseFloat(val);
	}
	return val;
});

// Product Schema (full, including ID)
export const ProductSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	sku: z.string().min(1, "SKU is required"),
	name: z.string().min(1, "Product name is required"),
	description: z.string().optional().nullable(),
	categoryId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid categoryId ObjectId format",
	}),
	vendorId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid vendorId ObjectId format",
	}),

	// Pricing
	retailPrice: decimalSchema,
	employeePrice: decimalSchema,
	costPrice: decimalSchema.optional().nullable(),

	// Inventory
	stockQuantity: z.number().int().min(0).default(0),
	lowStockThreshold: z.number().int().min(0).default(10),

	// Product details
	imageUrl: z.string().url().optional().nullable(),
	images: z.array(ProductImageSchema).optional().nullable(),
	specifications: z.record(z.any()).optional().nullable(),

	// Status
	isActive: z.boolean().default(true),
	isFeatured: z.boolean().default(false),
	isAvailable: z.boolean().default(true),
	status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING"),

	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Product = z.infer<typeof ProductSchema>;

// Create Product Schema (excluding ID, createdAt, updatedAt)
export const CreateProductSchema = ProductSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	costPrice: true,
	imageUrl: true,
	images: true,
	specifications: true,
	stockQuantity: true,
	lowStockThreshold: true,
	isActive: true,
	isFeatured: true,
	isAvailable: true,
});

export type CreateProduct = z.infer<typeof CreateProductSchema>;

// Update Product Schema (partial, excluding immutable fields)
export const UpdateProductSchema = ProductSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
