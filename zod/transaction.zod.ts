import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Enums
export const TransactionTypeEnum = z.enum([
	"PURCHASE",
	"INSTALLMENT",
	"POINTS_REDEMPTION",
	"REFUND",
	"ADJUSTMENT",
]);

export const TransactionStatusEnum = z.enum([
	"PENDING",
	"PROCESSING",
	"COMPLETED",
	"FAILED",
	"CANCELLED",
	"REVERSED",
]);

export const PaymentMethodEnum = z.enum([
	"PAYROLL_DEDUCTION",
	"CASH",
	"CREDIT_CARD",
	"DEBIT_CARD",
	"BANK_TRANSFER",
	"POINTS",
	"MIXED",
	"OTHER",
]);

export type TransactionType = z.infer<typeof TransactionTypeEnum>;
export type TransactionStatus = z.infer<typeof TransactionStatusEnum>;
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

// Decimal schema helper (for Float type)
const decimalSchema = z
	.union([z.string().regex(/^\d+\.?\d*$/, "Invalid decimal format"), z.number()])
	.transform((val) => {
		if (typeof val === "string") {
			return parseFloat(val);
		}
		return val;
	});

// Transaction Schema (full, including ID)
export const TransactionSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	transactionNumber: z.string().min(1, "Transaction number is required"),
	employeeId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid employeeId ObjectId format",
	}),
	orderId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid orderId ObjectId format",
	}),
	type: TransactionTypeEnum,
	status: TransactionStatusEnum.default("PENDING"),
	totalAmount: decimalSchema,
	paidAmount: decimalSchema.default(0),
	balance: decimalSchema,
	paymentMethod: PaymentMethodEnum,
	paymentHistory: z.array(z.record(z.any())).optional().nullable(),
	pointsUsed: decimalSchema.optional().nullable(),
	pointsTransactionId: z.string().optional().nullable(),
	cashAmount: decimalSchema.optional().nullable(),
	receiptNumber: z.string().optional().nullable(),
	isReconciled: z.boolean().default(false),
	reconciledAt: z.coerce.date().optional().nullable(),
	reconciledBy: z.string().optional().nullable(),
	notes: z.string().optional().nullable(),
	metadata: z.record(z.any()).optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

// Create Transaction Schema (excluding ID, createdAt, updatedAt)
export const CreateTransactionSchema = TransactionSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	status: true,
	paidAmount: true,
	paymentHistory: true,
	pointsUsed: true,
	pointsTransactionId: true,
	cashAmount: true,
	receiptNumber: true,
	isReconciled: true,
	reconciledAt: true,
	reconciledBy: true,
	notes: true,
	metadata: true,
});

export type CreateTransaction = z.infer<typeof CreateTransactionSchema>;

// Update Transaction Schema (partial, excluding immutable fields)
export const UpdateTransactionSchema = TransactionSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	transactionNumber: true, // Transaction number should not be changed
	employeeId: true, // Employee ID should not be changed
	orderId: true, // Order ID should not be changed
}).partial();

export type UpdateTransaction = z.infer<typeof UpdateTransactionSchema>;

// Schema for recording an installment payment
export const RecordPaymentSchema = z.object({
	installmentId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid installmentId ObjectId format",
	}),
	amount: decimalSchema,
	payrollBatchId: z.string().optional(),
	payrollReference: z.string().optional(),
	payrollDate: z.coerce.date().optional(),
	processedBy: z.string().optional(),
	notes: z.string().optional(),
});

export type RecordPayment = z.infer<typeof RecordPaymentSchema>;

// Schema for reconciling a transaction
export const ReconcileTransactionSchema = z.object({
	reconciledBy: z.string().min(1, "Reconciled by is required"),
	notes: z.string().optional(),
});

export type ReconcileTransaction = z.infer<typeof ReconcileTransactionSchema>;
