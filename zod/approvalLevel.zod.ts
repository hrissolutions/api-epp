import { z } from "zod";
import { ApproverRoleEnum } from "./orderApproval.zod";

// Number schema helper
const numberSchema = z
	.union([z.string().regex(/^\d+\.?\d*$/, "Invalid number format"), z.number()])
	.transform((val) => {
		if (typeof val === "string") {
			return parseFloat(val);
		}
		return val;
	});

// ApprovalLevel Schema (full, including ID)
// Note: workflowId and level are now in WorkflowApprovalLevel junction table
export const ApprovalLevelSchema = z.object({
	id: z.string(),
	role: ApproverRoleEnum,
	description: z.string().optional().nullable(),
	isRequired: z.boolean().default(true),
	autoApproveUnder: numberSchema.optional().nullable(),
	timeoutDays: z.number().int().positive("Timeout days must be positive").optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type ApprovalLevel = z.infer<typeof ApprovalLevelSchema>;

// Create ApprovalLevel Schema (excluding ID, createdAt, updatedAt)
export const CreateApprovalLevelSchema = ApprovalLevelSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	isRequired: true,
	autoApproveUnder: true,
	timeoutDays: true,
});

export type CreateApprovalLevel = z.infer<typeof CreateApprovalLevelSchema>;

// Update ApprovalLevel Schema (partial, excluding immutable fields)
export const UpdateApprovalLevelSchema = ApprovalLevelSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateApprovalLevel = z.infer<typeof UpdateApprovalLevelSchema>;
