import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Data type schema (embedded type)
const DataSchema = z.object({
	user: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid user ObjectId format",
	}),
	date: z.coerce.date(),
});

// Recipients type schema (embedded type)
const RecipientsSchema = z.object({
	read: z.array(DataSchema).default([]),
	unread: z.array(DataSchema).default([]),
});

// Notification Schema (full, including ID)
export const NotificationSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	source: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid source ObjectId format",
	}),
	category: z.string().min(1, "Category is required"),
	title: z.string().min(1, "Title is required"),
	description: z.string().min(1, "Description is required"),
	recipients: RecipientsSchema.optional().nullable(),
	metadata: z.record(z.any()).optional().nullable(),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Notification = z.infer<typeof NotificationSchema>;

// Create Notification Schema (excluding ID, createdAt, updatedAt)
export const CreateNotificationSchema = NotificationSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	recipients: true,
	metadata: true,
	isDeleted: true,
}).extend({
	organizationId: z.string().refine((val) => !val || isValidObjectId(val), {
		message: "Invalid organizationId ObjectId format",
	}).optional().nullable(),
});

export type CreateNotification = z.infer<typeof CreateNotificationSchema>;

// Update Notification Schema (partial, excluding immutable fields)
export const UpdateNotificationSchema = NotificationSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateNotification = z.infer<typeof UpdateNotificationSchema>;
