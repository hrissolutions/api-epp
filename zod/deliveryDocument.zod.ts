import { z } from "zod";
import { isValidObjectId } from "mongoose";

export const DeliveryDocumentTypeEnum = z.enum(["DELIVERY_ORDER", "DELIVERY_RECEIPT"]);
export const DeliveryTransferStageEnum = z.enum(["VENDOR_TO_ADMIN", "ADMIN_TO_CLIENT"]);
export const DeliveryPartyEnum = z.enum(["ADMIN", "SUPPLIER", "CLIENT"]);

const DeliveryDocumentItemSchema = z.object({
	itemId: z.string().optional().nullable(),
	sku: z.string(),
	description: z.string().optional().nullable(),
	quantity: z.number().int().positive(),
});

/** Derive default fromParty/toParty from documentType + transferStage when not provided. */
function defaultFromTo(
	documentType: "DELIVERY_ORDER" | "DELIVERY_RECEIPT",
	transferStage: "VENDOR_TO_ADMIN" | "ADMIN_TO_CLIENT",
): { fromParty: "ADMIN" | "SUPPLIER" | "CLIENT"; toParty: "ADMIN" | "SUPPLIER" | "CLIENT" } {
	if (transferStage === "VENDOR_TO_ADMIN") return { fromParty: "SUPPLIER", toParty: "ADMIN" };
	return { fromParty: "ADMIN", toParty: "CLIENT" };
}

export const CreateDeliveryDocumentSchema = z
	.object({
		documentType: DeliveryDocumentTypeEnum,
		transferStage: DeliveryTransferStageEnum,
		fromParty: DeliveryPartyEnum.optional(),
		toParty: DeliveryPartyEnum.optional(),
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
	fromName: z.string().optional().nullable(),
	fromAddress: z.string().optional().nullable(),
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
	})
	.transform((data) => {
		const defaults = defaultFromTo(data.documentType, data.transferStage);
		return {
			...data,
			fromParty: data.fromParty ?? defaults.fromParty,
			toParty: data.toParty ?? defaults.toParty,
		};
	});

export type CreateDeliveryDocument = z.infer<typeof CreateDeliveryDocumentSchema>;

export const UpdateDeliveryDocumentSchema = z.object({
	documentTime: z.coerce.date().optional().nullable(),
	fromName: z.string().optional().nullable(),
	fromAddress: z.string().optional().nullable(),
	fromLocation: z.string().optional().nullable(),
	toName: z.string().optional().nullable(),
	toAddress: z.string().optional().nullable(),
	carrierInfo: z.string().optional().nullable(),
	trackingNumber: z.string().optional().nullable(),
	expectedDeliveryDate: z.coerce.date().optional().nullable(),
	expectedDeliveryTime: z.string().optional().nullable(),
	internalDeliveryPersonnel: z.string().optional().nullable(),
	receiverName: z.string().optional().nullable(),
	receiverSignature: z.string().optional().nullable(),
	conditionOfGoods: z.string().optional().nullable(),
	items: z.array(DeliveryDocumentItemSchema).optional(),
});

export type UpdateDeliveryDocument = z.infer<typeof UpdateDeliveryDocumentSchema>;

/** Optional body for marking a Supplier DO as received (creates Admin DR). */
export const ReceiveDeliveryDocumentSchema = z.object({
	receiverName: z.string().optional().nullable(),
	receiverSignature: z.string().optional().nullable(),
	conditionOfGoods: z.string().optional().nullable(),
});

export type ReceiveDeliveryDocument = z.infer<typeof ReceiveDeliveryDocumentSchema>;
