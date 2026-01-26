import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Embedded types
export const EntitySchema = z.object({
	type: z.string().min(1, "Entity type is required"),
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid entity ObjectId format",
	}),
});

export const ChangesSchema = z.object({
	before: z.record(z.any()).optional().nullable(),
	after: z.record(z.any()).optional().nullable(),
});

export const RequestMetadataSchema = z.object({
	userAgent: z.string().min(1),
	ip: z.string().min(1),
	path: z.string().min(1),
	method: z.string().min(1),
});

// Full AuditLogging schema
export const AuditLoggingSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	userId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid userId ObjectId format",
	}),
	type: z.string().min(1, "Type is required"),
	severity: z.string().min(1, "Severity is required"),
	entity: EntitySchema,
	changes: ChangesSchema.optional().nullable(),
	metadata: RequestMetadataSchema.optional().nullable(),
	description: z.string().optional().nullable(),
	archiveStatus: z.boolean().default(false),
	archiveDate: z.coerce.date().optional().nullable(),
	isDeleted: z.boolean().default(false),
	timestamp: z.coerce.date(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type AuditLogging = z.infer<typeof AuditLoggingSchema>;

// Create schema (no id / timestamps)
export const CreateAuditLoggingSchema = AuditLoggingSchema.omit({
	id: true,
	timestamp: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	changes: true,
	metadata: true,
	description: true,
	archiveStatus: true,
	archiveDate: true,
	isDeleted: true,
}).extend({
	organizationId: z.string().refine((val) => !val || isValidObjectId(val), {
		message: "Invalid organizationId ObjectId format",
	}).optional().nullable(),
});

export type CreateAuditLogging = z.infer<typeof CreateAuditLoggingSchema>;

// Update schema (no id / userId / timestamps)
export const UpdateAuditLoggingSchema = AuditLoggingSchema.omit({
	id: true,
	userId: true,
	timestamp: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateAuditLogging = z.infer<typeof UpdateAuditLoggingSchema>;

