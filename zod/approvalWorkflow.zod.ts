import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Number schema helper
const numberSchema = z
	.union([z.string().regex(/^\d+\.?\d*$/, "Invalid number format"), z.number()])
	.transform((val) => {
		if (typeof val === "string") {
			return parseFloat(val);
		}
		return val;
	});

// ApprovalWorkflow Schema (full, including ID)
export const ApprovalWorkflowSchema = z.object({
	id: z.string(),
	name: z.string().min(1, "Workflow name is required"),
	description: z.string().optional().nullable(),
	isActive: z.boolean().default(true),
	minOrderAmount: numberSchema.optional().nullable(),
	maxOrderAmount: numberSchema.optional().nullable(),
	requiresInstallment: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type ApprovalWorkflow = z.infer<typeof ApprovalWorkflowSchema>;

// Create ApprovalWorkflow Schema (excluding ID, createdAt, updatedAt)
export const CreateApprovalWorkflowSchema = ApprovalWorkflowSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	isActive: true,
	minOrderAmount: true,
	maxOrderAmount: true,
	requiresInstallment: true,
}).extend({
	organizationId: z.string().refine((val) => !val || isValidObjectId(val), {
		message: "Invalid organizationId ObjectId format",
	}).optional().nullable(),
});

export type CreateApprovalWorkflow = z.infer<typeof CreateApprovalWorkflowSchema>;

// Update ApprovalWorkflow Schema (partial, excluding immutable fields)
export const UpdateApprovalWorkflowSchema = ApprovalWorkflowSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateApprovalWorkflow = z.infer<typeof UpdateApprovalWorkflowSchema>;
