import { z } from "zod";
import { isValidObjectId } from "mongoose";

const objectIdOptional = z
	.string()
	.refine((val) => !val || isValidObjectId(val), { message: "Invalid ObjectId format" })
	.optional()
	.nullable();

const objectIdRequired = z
	.string()
	.refine((val) => isValidObjectId(val), { message: "Invalid ObjectId format" });

const decimalSchema = z
	.union([z.string().regex(/^-?\d+\.?\d*$/, "Invalid decimal format"), z.number()])
	.transform((val) => (typeof val === "string" ? parseFloat(val) : val));

// e.g. 3 installments → 1.5%, 6 → 2%, 12 → 3%
export const InstallmentRateTierSchema = z.object({
	installmentCount: z.number().int().positive(),
	rate: decimalSchema, // percentage, e.g. 1.5 = 1.5%
});

export const InstallmentRateConfigSchema = z.array(InstallmentRateTierSchema);

export type InstallmentRateTier = z.infer<typeof InstallmentRateTierSchema>;
export type InstallmentRateConfig = z.infer<typeof InstallmentRateConfigSchema>;

export const UserTypeEnum = z.enum([
	"ADMIN",
	"EMPLOYEE",
	"INDIVIDUAL",
	"RETAILER",
	"WHOLESALER",
	"FINANCIER",
	"VENDOR",
]);
export type UserType = z.infer<typeof UserTypeEnum>;

export const FinancierConfigSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), { message: "Invalid ObjectId format" }),
	organizationId: objectIdOptional,
	userId: z.string().min(1, "User id is required"),
	userType: UserTypeEnum,
	name: z.string().min(1, "Financier config name is required"),
	code: z.string().optional().nullable(),
	isActive: z.boolean().default(true),
	maxCreditLimit: decimalSchema,
	usedCredits: decimalSchema.optional().default(0), // Stored sum of principal from approved financing
	availableCredits: decimalSchema.optional().default(0), // Stored remaining credit; decremented on financing
	autoApproveLimit: decimalSchema,
	installmentRateConfig: InstallmentRateConfigSchema.optional().nullable(),
	notes: z.string().optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type FinancierConfig = z.infer<typeof FinancierConfigSchema>;

export const CreateFinancierConfigSchema = FinancierConfigSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).extend({
	organizationId: objectIdOptional,
});

export type CreateFinancierConfig = z.infer<typeof CreateFinancierConfigSchema>;

export const UpdateFinancierConfigSchema = FinancierConfigSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateFinancierConfig = z.infer<typeof UpdateFinancierConfigSchema>;
