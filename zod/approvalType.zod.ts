import { z } from "zod";
import { isValidObjectId } from "mongoose";
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

// ApprovalType Schema (full, including ID)
// Note: workflowId and level are now in WorkflowApprovalLevel junction table
export const ApprovalTypeSchema = z.object({
	id: z.string(),
	role: ApproverRoleEnum,
	description: z.string().optional().nullable(),
	isRequired: z.boolean().default(true),
	autoApproveUnder: numberSchema.optional().nullable(),
	timeoutDays: z.number().int().positive("Timeout days must be positive").optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type ApprovalType = z.infer<typeof ApprovalTypeSchema>;

// Create ApprovalType Schema (excluding ID, createdAt, updatedAt)
export const CreateApprovalTypeSchema = ApprovalTypeSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
})
	.partial({
		description: true,
		isRequired: true,
		autoApproveUnder: true,
		timeoutDays: true,
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

export type CreateApprovalType = z.infer<typeof CreateApprovalTypeSchema>;

// Update ApprovalType Schema (partial, excluding immutable fields)
export const UpdateApprovalTypeSchema = ApprovalTypeSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateApprovalType = z.infer<typeof UpdateApprovalTypeSchema>;
