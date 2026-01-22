import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Enums
export const ItemTypeEnum = z.enum(["PRODUCT", "LOAN"]);
export type ItemType = z.infer<typeof ItemTypeEnum>;

export const ItemImageTypeEnum = z.enum([
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

export type ItemImageType = z.infer<typeof ItemImageTypeEnum>;

// ItemImage schema - Keep same format (url, type, name)
export const ItemImageSchema = z.object({
	name: z.string().optional().nullable(),
	url: z.string().url().optional().nullable(),
	type: ItemImageTypeEnum.optional().nullable(),
});

export type ItemImage = z.infer<typeof ItemImageSchema>;

// Decimal schema helper (for Prisma Decimal type)
const decimalSchema = z
	.union([z.string().regex(/^\d+\.?\d*$/, "Invalid decimal format"), z.number()])
	.transform((val) => {
		if (typeof val === "string") {
			return parseFloat(val);
		}
		return val;
	});

// Item Schema (full, including ID)
export const ItemSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	sku: z.string().min(1, "SKU is required"),
	name: z.string().min(1, "Item name is required"),
	description: z.string().optional().nullable(),
	categoryId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid categoryId ObjectId format",
	}),
	vendorId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid vendorId ObjectId format",
	}),

	// Item type
	itemType: ItemTypeEnum.default("PRODUCT"),

	// Pricing
	retailPrice: decimalSchema,
	sellingPrice: decimalSchema,
	costPrice: decimalSchema.optional().nullable(),

	// Inventory
	stockQuantity: z.number().int().min(0).default(0),
	lowStockThreshold: z.number().int().min(0).default(10),

	// Item details
	imageUrl: z.string().url().optional().nullable(),
	images: z.array(ItemImageSchema).optional().nullable(),
	specifications: z.record(z.any()).optional().nullable(),

	// Status
	isActive: z.boolean().default(true),
	isFeatured: z.boolean().default(false),
	isAvailable: z.boolean().default(true),
	status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING"),

	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Item = z.infer<typeof ItemSchema>;

// Create Item Schema (excluding ID, createdAt, updatedAt)
export const CreateItemSchema = ItemSchema.omit({
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
	itemType: true,
});

export type CreateItem = z.infer<typeof CreateItemSchema>;

// Update Item Schema (partial, excluding immutable fields)
export const UpdateItemSchema = ItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateItem = z.infer<typeof UpdateItemSchema>;
