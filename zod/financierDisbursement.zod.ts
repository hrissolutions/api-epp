import { z } from "zod";
import { isValidObjectId } from "mongoose";

export const DisbursementStatusEnum = z.enum(["PENDING", "DISBURSED", "FAILED", "CANCELLED"]);
export const ReconciliationStatusEnum = z.enum([
	"PENDING",
	"MATCHED",
	"PARTIAL",
	"DISPUTED",
	"SETTLED",
]);

/** Receipt type: OR (Official Receipt) or bank transfer receipt */
export const ReceiptTypeEnum = z.enum(["OR", "BANK_RECEIPT"]);

const objectId = (field: string) =>
	z.string().refine((val) => isValidObjectId(val), {
		message: `Invalid ${field} ObjectId format`,
	});

export const FinancierDisbursementSchema = z.object({
	id: objectId("id"),
	orderId: objectId("orderId"),
	financingAgreementId: objectId("financingAgreementId"),
	financierConfigId: objectId("financierConfigId"),
	referenceNo: z.string().optional().nullable(),
	amount: z.number().positive(),
	currency: z.string().default("PHP"),
	disbursedAt: z.coerce.date().optional().nullable(),
	expectedAt: z.coerce.date().optional().nullable(),
	receiptType: ReceiptTypeEnum.optional().nullable(),
	receiptNumber: z.string().optional().nullable(),
	receiptAttachmentUrl: z
		.union([z.string().url(), z.literal("")])
		.optional()
		.nullable(),
	status: DisbursementStatusEnum.default("PENDING"),
	reconciliationStatus: ReconciliationStatusEnum.default("PENDING"),
	reconciledAt: z.coerce.date().optional().nullable(),
	reconciledBy: objectId("reconciledBy").optional().nullable(),
	notes: z.string().optional().nullable(),
	metadata: z.record(z.any()).optional().nullable(),
	organizationId: objectId("organizationId").optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export const CreateFinancierDisbursementSchema = FinancierDisbursementSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	referenceNo: true,
	disbursedAt: true,
	expectedAt: true,
	receiptType: true,
	receiptNumber: true,
	receiptAttachmentUrl: true,
	status: true,
	reconciliationStatus: true,
	reconciledAt: true,
	reconciledBy: true,
	notes: true,
	metadata: true,
	organizationId: true,
});

export const UpdateFinancierDisbursementSchema = FinancierDisbursementSchema.omit({
	id: true,
	orderId: true,
	financingAgreementId: true,
	financierConfigId: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export const ReconcileFinancierDisbursementSchema = z.object({
	reconciledBy: objectId("reconciledBy"),
	notes: z.string().optional(),
	status: ReconciliationStatusEnum.default("MATCHED"),
});

/** Body for upload-receipt (multipart: receiptType, receiptNumber from form fields) */
export const UploadReceiptSchema = z.object({
	receiptType: ReceiptTypeEnum,
	receiptNumber: z.string().optional().nullable(),
});

export const AdminFinancierSettlementSchema = z.object({
	id: objectId("id"),
	financierDisbursementId: objectId("financierDisbursementId"),
	financierConfigId: objectId("financierConfigId"),
	amount: z.number().positive(),
	currency: z.string().default("PHP"),
	remittedAt: z.coerce.date().optional().nullable(),
	dueAt: z.coerce.date().optional().nullable(),
	referenceNo: z.string().optional().nullable(),
	receiptType: ReceiptTypeEnum.optional().nullable(),
	receiptNumber: z.string().optional().nullable(),
	receiptAttachmentUrl: z
		.union([z.string().url(), z.literal("")])
		.optional()
		.nullable(),
	createdBy: z.string().optional().nullable(),
	notes: z.string().optional().nullable(),
	metadata: z.record(z.any()).optional().nullable(),
	organizationId: objectId("organizationId").optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export const CreateAdminFinancierSettlementSchema = AdminFinancierSettlementSchema.omit({
	id: true,
	financierDisbursementId: true,
	financierConfigId: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	currency: true,
	remittedAt: true,
	dueAt: true,
	referenceNo: true,
	receiptType: true,
	receiptNumber: true,
	receiptAttachmentUrl: true,
	createdBy: true,
	notes: true,
	metadata: true,
	organizationId: true,
});

/** Standalone create: requires financierDisbursementId, financierConfigId, amount (for CRUD API) */
export const CreateAdminFinancierSettlementStandaloneSchema = z.object({
	financierDisbursementId: objectId("financierDisbursementId"),
	financierConfigId: objectId("financierConfigId"),
	amount: z.number().positive(),
	currency: z.string().optional().nullable(),
	remittedAt: z.coerce.date().optional().nullable(),
	dueAt: z.coerce.date().optional().nullable(),
	referenceNo: z.string().optional().nullable(),
	receiptType: ReceiptTypeEnum.optional().nullable(),
	receiptNumber: z.string().optional().nullable(),
	receiptAttachmentUrl: z
		.union([z.string().url(), z.literal("")])
		.optional()
		.nullable(),
	createdBy: z.string().optional().nullable(),
	notes: z.string().optional().nullable(),
	metadata: z.record(z.any()).optional().nullable(),
	organizationId: objectId("organizationId").optional().nullable(),
});

export const UpdateAdminFinancierSettlementSchema = AdminFinancierSettlementSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();
