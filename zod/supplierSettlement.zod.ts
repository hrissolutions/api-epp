import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { ReconciliationStatusEnum, ReceiptTypeEnum } from "./financierDisbursement.zod";

export const SettlementStatusEnum = z.enum(["PENDING", "PAID", "PARTIAL", "FAILED", "CANCELLED"]);

const objectId = (field: string) =>
	z.string().refine((val) => isValidObjectId(val), {
		message: `Invalid ${field} ObjectId format`,
	});

export const SupplierSettlementSchema = z.object({
	id: objectId("id"),
	orderId: objectId("orderId"),
	purchaseOrderId: objectId("purchaseOrderId"),
	supplierId: objectId("supplierId"),
	financierDisbursementId: objectId("financierDisbursementId").optional().nullable(),
	referenceNo: z.string().optional().nullable(),
	amount: z.number().positive(),
	currency: z.string().default("PHP"),
	paidAt: z.coerce.date().optional().nullable(),
	dueAt: z.coerce.date().optional().nullable(),
	receiptType: ReceiptTypeEnum.optional().nullable(),
	receiptNumber: z.string().optional().nullable(),
	receiptAttachmentUrl: z
		.union([z.string().url(), z.literal("")])
		.optional()
		.nullable(),
	status: SettlementStatusEnum.default("PENDING"),
	reconciliationStatus: ReconciliationStatusEnum.default("PENDING"),
	reconciledAt: z.coerce.date().optional().nullable(),
	reconciledBy: objectId("reconciledBy").optional().nullable(),
	notes: z.string().optional().nullable(),
	metadata: z.record(z.any()).optional().nullable(),
	organizationId: objectId("organizationId").optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export const CreateSupplierSettlementSchema = SupplierSettlementSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	financierDisbursementId: true,
	referenceNo: true,
	paidAt: true,
	dueAt: true,
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

export const UpdateSupplierSettlementSchema = SupplierSettlementSchema.omit({
	id: true,
	orderId: true,
	purchaseOrderId: true,
	supplierId: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export const ReconcileSupplierSettlementSchema = z.object({
	reconciledBy: objectId("reconciledBy"),
	notes: z.string().optional(),
	status: ReconciliationStatusEnum.default("MATCHED"),
});

// AdminSupplierSettlement = payment/remittance from admin to supplier (like AdminFinancierSettlement)
export const AdminSupplierSettlementSchema = z.object({
	id: objectId("id"),
	supplierSettlementId: objectId("supplierSettlementId"),
	supplierId: objectId("supplierId"),
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

export const CreateAdminSupplierSettlementSchema = AdminSupplierSettlementSchema.omit({
	id: true,
	supplierSettlementId: true,
	supplierId: true,
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

export const CreateAdminSupplierSettlementStandaloneSchema = z.object({
	supplierSettlementId: objectId("supplierSettlementId"),
	supplierId: objectId("supplierId"),
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

export const UpdateAdminSupplierSettlementSchema = AdminSupplierSettlementSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

/** Body for POST /supplier-settlement/:id/remittance (supplierSettlementId from params) */
export const CreateRemittanceBySettlementIdSchema = z.object({
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
});

