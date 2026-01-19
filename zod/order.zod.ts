import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Enums
export const OrderStatusEnum = z.enum([
	"PENDING_APPROVAL",
	"APPROVED",
	"REJECTED",
	"PROCESSING",
	"SHIPPED",
	"DELIVERED",
	"CANCELLED",
	"RETURNED",
]);

export const PaymentMethodEnum = z.enum([
	"PAYROLL_DEDUCTION",
	"CASH",
	"CREDIT_CARD",
	"DEBIT_CARD",
	"BANK_TRANSFER",
	"OTHER",
]);

export const PaymentStatusEnum = z.enum([
	"PENDING",
	"PROCESSING",
	"COMPLETED",
	"FAILED",
	"REFUNDED",
]);

export const PaymentTypeEnum = z.enum(["CASH", "INSTALLMENT", "POINTS", "MIXED"]);

export type OrderStatus = z.infer<typeof OrderStatusEnum>;
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;
export type PaymentType = z.infer<typeof PaymentTypeEnum>;

// Decimal schema helper (for Prisma Float type)
const decimalSchema = z.union([
	z.string().regex(/^\d+\.?\d*$/, "Invalid decimal format"),
	z.number(),
]).transform((val) => {
	if (typeof val === "string") {
		return parseFloat(val);
	}
	return val;
});

// Order Item Schema (embedded in order) - for input (discount and subtotal are optional, will be calculated)
export const OrderItemInputSchema = z.object({
	productId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid productId ObjectId format",
	}),
	quantity: z.number().int().min(1, "Quantity must be at least 1"),
	unitPrice: decimalSchema.optional(), // Optional, will be fetched from product.employeePrice if not provided
	discount: decimalSchema.optional(), // Optional, will be calculated from product if not provided
	subtotal: decimalSchema.optional(), // Optional, will be calculated
});

// Order Item Schema (for output/validation after calculation)
export const OrderItemSchema = z.object({
	productId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid productId ObjectId format",
	}),
	quantity: z.number().int().min(1, "Quantity must be at least 1"),
	unitPrice: decimalSchema,
	discount: decimalSchema.default(0),
	subtotal: decimalSchema,
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

// Order Schema (full, including ID)
export const OrderSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	orderNumber: z.string().min(1, "Order number is required"),
	employeeId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid employeeId ObjectId format",
	}),
	status: OrderStatusEnum.default("PENDING_APPROVAL"),
	items: z.array(OrderItemSchema).min(1, "Order must have at least one item"),
	subtotal: decimalSchema,
	discount: decimalSchema.default(0),
	tax: decimalSchema.default(0),
	total: decimalSchema,
	paymentType: PaymentTypeEnum.default("INSTALLMENT"),
	installmentMonths: z.number().int().optional().nullable(),
	installmentCount: z.number().int().optional().nullable(),
	installmentAmount: decimalSchema.optional().nullable(),
	pointsUsed: decimalSchema.optional().nullable(),
	trackingNumber: z.string().optional().nullable(),
	paymentMethod: PaymentMethodEnum.default("PAYROLL_DEDUCTION"),
	paymentStatus: PaymentStatusEnum.default("PENDING"),
	orderDate: z.coerce.date(),
	shippedDate: z.coerce.date().optional().nullable(),
	deliveredDate: z.coerce.date().optional().nullable(),
	cancelledDate: z.coerce.date().optional().nullable(),
	notes: z.string().optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Order = z.infer<typeof OrderSchema>;

// Create Order Schema (excluding ID, createdAt, updatedAt)
// Items use OrderItemInputSchema (without required discount/subtotal)
// All calculated fields (subtotal, discount, tax, total) are optional
export const CreateOrderSchema = z.object({
	orderNumber: z.string().min(1, "Order number is required").optional(),
	employeeId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid employeeId ObjectId format",
	}),
	status: OrderStatusEnum.optional(),
	items: z.array(OrderItemInputSchema).min(1, "Order must have at least one item"),
	subtotal: decimalSchema.optional(), // Will be calculated
	discount: decimalSchema.optional(), // Will be calculated
	tax: decimalSchema.optional(), // Will be calculated
	total: decimalSchema.optional(), // Will be calculated
	paymentType: PaymentTypeEnum.optional(),
	installmentMonths: z.number().int().optional().nullable(),
	installmentCount: z.number().int().optional().nullable(),
	installmentAmount: decimalSchema.optional().nullable(),
	pointsUsed: decimalSchema.optional().nullable(),
	trackingNumber: z.string().optional().nullable(),
	paymentMethod: PaymentMethodEnum.optional(),
	paymentStatus: PaymentStatusEnum.optional(),
	orderDate: z.coerce.date().optional(),
	shippedDate: z.coerce.date().optional().nullable(),
	deliveredDate: z.coerce.date().optional().nullable(),
	cancelledDate: z.coerce.date().optional().nullable(),
	notes: z.string().optional().nullable(),
});

export type CreateOrder = z.infer<typeof CreateOrderSchema>;

// Update Order Schema (partial, excluding immutable fields)
export const UpdateOrderSchema = OrderSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateOrder = z.infer<typeof UpdateOrderSchema>;
