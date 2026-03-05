import { z } from "zod";
import { isValidObjectId } from "mongoose";

const objectIdOptional = z
	.string()
	.refine((val) => !val || isValidObjectId(val), { message: "Invalid ObjectId format" })
	.optional()
	.nullable();

const decimalSchema = z
	.union([z.string().regex(/^-?\d+\.?\d*$/, "Invalid decimal format"), z.number()])
	.transform((val) => (typeof val === "string" ? parseFloat(val) : val));

export const FinancingStatusEnum = z.enum([
	"PENDING",
	"APPROVED",
	"ACTIVE",
	"COMPLETED",
	"CANCELLED",
]);

export type FinancingStatus = z.infer<typeof FinancingStatusEnum>;

export const FinancingAgreementSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), { message: "Invalid ObjectId format" }),
	organizationId: objectIdOptional,
	orderId: z.string().refine((val) => isValidObjectId(val), { message: "Invalid orderId" }),
	financierConfigId: z
		.string()
		.refine((val) => isValidObjectId(val), { message: "Invalid financierConfigId" }),
	principalAmount: decimalSchema,
	totalPayable: decimalSchema,
	installmentCount: z.number().int().positive(),
	installmentAmount: decimalSchema,
	interestRate: decimalSchema,
	status: FinancingStatusEnum.default("PENDING"),
	adminRemittanceTermDays: z.number().int().nonnegative().optional().nullable(),
	adminRemittanceDueDate: z.coerce.date().optional().nullable(),
	approvedAt: z.coerce.date().optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type FinancingAgreement = z.infer<typeof FinancingAgreementSchema>;

export const CreateFinancingAgreementSchema = FinancingAgreementSchema.omit({
	id: true,
	adminRemittanceTermDays: true,
	adminRemittanceDueDate: true,
	createdAt: true,
	updatedAt: true,
}).extend({
	organizationId: objectIdOptional,
});

export type CreateFinancingAgreement = z.infer<typeof CreateFinancingAgreementSchema>;

export const UpdateFinancingAgreementSchema = FinancingAgreementSchema.omit({
	id: true,
	orderId: true,
	financierConfigId: true,
	adminRemittanceTermDays: true,
	adminRemittanceDueDate: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateFinancingAgreement = z.infer<typeof UpdateFinancingAgreementSchema>;
