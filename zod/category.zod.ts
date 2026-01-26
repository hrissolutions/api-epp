import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Helper to generate slug from name
export const generateSlug = (name: string): string => {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
};

// Category Schema (full, including ID)
export const CategorySchema = z.object({
	id: z.string(),
	name: z.string().min(1, "Category name is required"),
	slug: z.string().min(1, "Category slug is required"),
	description: z.string().optional().nullable(),
	parentId: z.string().optional().nullable(),
	isActive: z.boolean().default(true),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Category = z.infer<typeof CategorySchema>;

// Create Category Schema (excluding ID, createdAt, updatedAt)
export const CreateCategorySchema = CategorySchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
})
	.partial({
		description: true,
		parentId: true,
		isActive: true,
		slug: true, // Slug is optional, will be auto-generated from name if not provided
	})
	.extend({
		organizationId: z.string().refine((val) => !val || isValidObjectId(val), {
			message: "Invalid organizationId ObjectId format",
		}).optional().nullable(),
	})
	.refine(
		(data) => {
			// If slug is not provided, it will be generated from name
			return data.name && data.name.length > 0;
		},
		{
			message: "Category name is required",
		},
	)
	.transform((data) => {
		// Auto-generate slug from name if not provided
		if (!data.slug && data.name) {
			return {
				...data,
				slug: generateSlug(data.name),
			};
		}
		return data;
	});

export type CreateCategory = z.infer<typeof CreateCategorySchema>;

// Update Category Schema (partial, excluding immutable fields)
export const UpdateCategorySchema = CategorySchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
})
	.partial()
	.transform((data) => {
		// Auto-generate slug from name if name is updated and slug not provided
		if (data.name && !data.slug) {
			return {
				...data,
				slug: generateSlug(data.name),
			};
		}
		return data;
	});

export type UpdateCategory = z.infer<typeof UpdateCategorySchema>;
