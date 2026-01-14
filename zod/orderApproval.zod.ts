import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Enums
export const ApproverRoleEnum = z.enum([
	"MANAGER",
	"HR",
	"FINANCE",
	"DEPARTMENT_HEAD",
	"ADMIN",
]);

export const ApprovalStatusEnum = z.enum([
	"PENDING",
	"APPROVED",
	"REJECTED",
	"EXPIRED",
	"SKIPPED",
]);

export type ApproverRole = z.infer<typeof ApproverRoleEnum>;
export type ApprovalStatus = z.infer<typeof ApprovalStatusEnum>;

// OrderApproval Schema (full, including ID)
export const OrderApprovalSchema = z.object({
	id: z.string(),
	orderId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid orderId ObjectId format",
	}),
	approvalLevel: z.number().int().positive("Approval level must be positive"),
	approverRole: ApproverRoleEnum,
	approverId: z.string().min(1, "Approver ID is required"),
	approverName: z.string().min(1, "Approver name is required"),
	approverEmail: z.string().email("Invalid email format"),
	status: ApprovalStatusEnum.default("PENDING"),
	approvedAt: z.coerce.date().optional().nullable(),
	rejectedAt: z.coerce.date().optional().nullable(),
	comments: z.string().optional().nullable(),
	notifiedAt: z.coerce.date().optional().nullable(),
	reminderSentAt: z.coerce.date().optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type OrderApproval = z.infer<typeof OrderApprovalSchema>;

// Create OrderApproval Schema (excluding ID, createdAt, updatedAt)
export const CreateOrderApprovalSchema = OrderApprovalSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	status: true,
	approvedAt: true,
	rejectedAt: true,
	comments: true,
	notifiedAt: true,
	reminderSentAt: true,
});

export type CreateOrderApproval = z.infer<typeof CreateOrderApprovalSchema>;

// Update OrderApproval Schema (partial, excluding immutable fields)
export const UpdateOrderApprovalSchema = OrderApprovalSchema.omit({
	id: true,
	orderId: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateOrderApproval = z.infer<typeof UpdateOrderApprovalSchema>;
