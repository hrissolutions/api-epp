import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Enums
export const PurchaseTypeEnum = z.enum([
	"FULL_PAYMENT",
	"PAYROLL_LOAN",
]);

export const PurchaseStatusEnum = z.enum([
	"PENDING",
	"APPROVED",
	"REJECTED",
	"ACTIVE",
	"COMPLETED",
	"CANCELLED",
]);

export type PurchaseType = z.infer<typeof PurchaseTypeEnum>;
export type PurchaseStatus = z.infer<typeof PurchaseStatusEnum>;

// Purchase Schema (full, including ID)
export const PurchaseSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	employeeId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid employeeId ObjectId format",
	}),
	productId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid productId ObjectId format",
	}),
	purchaseType: PurchaseTypeEnum,
	totalAmount: z.number().positive("Total amount must be positive"),
	downPayment: z.number().min(0).optional().nullable(),
	status: PurchaseStatusEnum.default("PENDING"),
	approvedBy: z.string().refine((val) => !val || isValidObjectId(val), {
		message: "Invalid approvedBy ObjectId format",
	}).optional().nullable(),
	approvedAt: z.coerce.date().optional().nullable(),
	rejectionReason: z.string().optional().nullable(),
	notes: z.string().optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Purchase = z.infer<typeof PurchaseSchema>;

// Create Purchase Schema (excluding ID, createdAt, updatedAt)
export const CreatePurchaseSchema = PurchaseSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	approvedAt: true,
}).partial({
	downPayment: true,
	status: true,
	approvedBy: true,
	rejectionReason: true,
	notes: true,
});

export type CreatePurchase = z.infer<typeof CreatePurchaseSchema>;

// Update Purchase Schema (partial, excluding immutable fields)
export const UpdatePurchaseSchema = PurchaseSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdatePurchase = z.infer<typeof UpdatePurchaseSchema>;
