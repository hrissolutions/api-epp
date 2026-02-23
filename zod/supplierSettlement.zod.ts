import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { ReconciliationStatusEnum } from "./financierDisbursement.zod";

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

