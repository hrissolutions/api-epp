import { z } from "zod";
import { isValidObjectId } from "mongoose";

export const InstallmentStatusEnum = z.enum([
	"PENDING",
	"SCHEDULED",
	"DEDUCTED",
	"FAILED",
	"CANCELLED",
	"REFUNDED",
]);

export type InstallmentStatus = z.infer<typeof InstallmentStatusEnum>;

// Decimal helper for numeric conversion
const decimalSchema = z
	.union([z.string().regex(/^-?\d+\.?\d*$/, "Invalid decimal format"), z.number()])
	.transform((val) => (typeof val === "string" ? parseFloat(val) : val));

// Installment Schema (full, including ID)
export const InstallmentSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), { message: "Invalid ObjectId format" }),
	orderId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid orderId ObjectId format",
	}),
	installmentNumber: z.number().int().min(1, "installmentNumber must be at least 1"),
	amount: decimalSchema,
	status: InstallmentStatusEnum.default("PENDING"),
	cutOffDate: z.coerce.date(),
	scheduledDate: z.coerce.date(),
	deductedDate: z.coerce.date().optional().nullable(),
	payrollBatchId: z.string().optional().nullable(),
	deductionReference: z.string().optional().nullable(),
	notes: z.string().optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Installment = z.infer<typeof InstallmentSchema>;

// Create Installment Schema (excluding ID, createdAt, updatedAt)
export const CreateInstallmentSchema = InstallmentSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	deductedDate: true,
	payrollBatchId: true,
	deductionReference: true,
	notes: true,
	status: true,
});

export type CreateInstallment = z.infer<typeof CreateInstallmentSchema>;

// Update Installment Schema (partial, excluding immutable fields)
export const UpdateInstallmentSchema = InstallmentSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateInstallment = z.infer<typeof UpdateInstallmentSchema>;
