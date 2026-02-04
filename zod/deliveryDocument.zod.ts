import { z } from "zod";
import { isValidObjectId } from "mongoose";

export const DeliveryDocumentTypeEnum = z.enum(["DELIVERY_ORDER", "DELIVERY_RECEIPT"]);
export const DeliveryTransferStageEnum = z.enum(["VENDOR_TO_ADMIN", "ADMIN_TO_CLIENT"]);

const DeliveryDocumentItemSchema = z.object({
	itemId: z.string().optional().nullable(),
	sku: z.string(),
	description: z.string().optional().nullable(),
	quantity: z.number().int().positive(),
});

export const CreateDeliveryDocumentSchema = z.object({
	documentType: DeliveryDocumentTypeEnum,
	transferStage: DeliveryTransferStageEnum,
	documentNumber: z.string().min(1),
	documentDate: z.coerce.date(),
	documentTime: z.coerce.date().optional().nullable(),
	correspondingDocumentId: z
		.string()
		.refine((val) => !val || isValidObjectId(val))
		.optional()
		.nullable(),
	purchaseOrderId: z
		.string()
		.refine((val) => !val || isValidObjectId(val))
		.optional()
		.nullable(),
	orderId: z
		.string()
		.refine((val) => !val || isValidObjectId(val))
		.optional()
		.nullable(),
	supplierId: z
		.string()
		.refine((val) => !val || isValidObjectId(val))
		.optional()
		.nullable(),
	fromLocation: z.string().optional().nullable(),
	toName: z.string().optional().nullable(),
	toAddress: z.string().optional().nullable(),
	clientUserId: z
		.string()
		.refine((val) => !val || isValidObjectId(val))
		.optional()
		.nullable(),
	carrierInfo: z.string().optional().nullable(),
	trackingNumber: z.string().optional().nullable(),
	expectedDeliveryDate: z.coerce.date().optional().nullable(),
	expectedDeliveryTime: z.string().optional().nullable(),
	internalDeliveryPersonnel: z.string().optional().nullable(),
	receiverName: z.string().optional().nullable(),
	receiverSignature: z.string().optional().nullable(),
	conditionOfGoods: z.string().optional().nullable(),
	items: z.array(DeliveryDocumentItemSchema).default([]),
	organizationId: z
		.string()
		.refine((val) => !val || isValidObjectId(val))
		.optional()
		.nullable(),
});

export type CreateDeliveryDocument = z.infer<typeof CreateDeliveryDocumentSchema>;

export const UpdateDeliveryDocumentSchema = z.object({
	documentTime: z.coerce.date().optional().nullable(),
	receiverName: z.string().optional().nullable(),
	receiverSignature: z.string().optional().nullable(),
	conditionOfGoods: z.string().optional().nullable(),
	items: z.array(DeliveryDocumentItemSchema).optional(),
});

export type UpdateDeliveryDocument = z.infer<typeof UpdateDeliveryDocumentSchema>;
