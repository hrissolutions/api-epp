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

