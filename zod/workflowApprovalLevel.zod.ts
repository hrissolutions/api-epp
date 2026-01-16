import { z } from "zod";

// Number schema helper
const numberSchema = z.union([
	z.string().regex(/^\d+\.?\d*$/, "Invalid number format"),
	z.number(),
]).transform((val) => {
	if (typeof val === "string") {
		return parseFloat(val);
	}
	return val;
});

// WorkflowApprovalLevel Schema (full, including ID)
export const WorkflowApprovalLevelSchema = z.object({
	id: z.string(),
	workflowId: z.string().min(1, "Workflow ID is required"),
	approvalLevelId: z.string().min(1, "Approval Level ID is required"),
	level: z.number().int().positive("Level must be positive"),
	approverId: z.string().optional().nullable(),
	approverName: z.string().optional().nullable(),
	approverEmail: z.string().email("Invalid email format").optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type WorkflowApprovalLevel = z.infer<typeof WorkflowApprovalLevelSchema>;

// Create WorkflowApprovalLevel Schema (excluding ID, createdAt, updatedAt)
export const CreateWorkflowApprovalLevelSchema = WorkflowApprovalLevelSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});

export type CreateWorkflowApprovalLevel = z.infer<typeof CreateWorkflowApprovalLevelSchema>;

// Update WorkflowApprovalLevel Schema (partial, excluding immutable fields)
export const UpdateWorkflowApprovalLevelSchema = WorkflowApprovalLevelSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateWorkflowApprovalLevel = z.infer<typeof UpdateWorkflowApprovalLevelSchema>;
