import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";
import {
	generateSupplierDONumber,
	generateAdminDRNumber,
	generateAdminDONumber,
	generateClientDRNumber,
} from "./generate-DeliveryDocumentNumber.helper";

const logger = getLogger();
const docServiceLogger = logger.child({ module: "deliveryDocumentService" });

/**
 * Create a Supplier Delivery Order (DO) for an approved Purchase Order.
 * Called when PO status is set to CONFIRMED.
 */
export const createSupplierDOForPO = async (
	prisma: PrismaClient,
	purchaseOrderId: string,
): Promise<{ id: string; documentNumber: string } | null> => {
	const po = await prisma.purchaseOrder.findUnique({
		where: { id: purchaseOrderId },
		include: {
			supplier: { select: { id: true, name: true, address: true } },
			order: { select: { id: true } },
		},
	});

	if (!po) {
		docServiceLogger.warn(`PurchaseOrder not found: ${purchaseOrderId}`);
		return null;
	}

	const existing = await prisma.deliveryDocument.findFirst({
		where: {
			purchaseOrderId,
			documentType: "DELIVERY_ORDER",
			transferStage: "VENDOR_TO_ADMIN",
		},
		select: { id: true, documentNumber: true },
	});
	if (existing) {
		docServiceLogger.info(
			`Supplier DO already exists for PO ${po.poNumber}: ${existing.documentNumber}`,
		);
		return { id: existing.id, documentNumber: existing.documentNumber };
	}

	const items = Array.isArray(po.items) ? (po.items as any[]) : [];
	const doItems = items.map((row: any) => ({
		itemId: row.itemId ?? undefined,
		sku: row.sku ?? "",
		description: row.description ?? undefined,
		quantity: typeof row.quantity === "number" ? row.quantity : 1,
	}));

	if (doItems.length === 0) {
		docServiceLogger.warn(`PO ${po.poNumber} has no items, skipping Supplier DO creation`);
		return null;
	}

	const documentNumber = await generateSupplierDONumber(prisma);
	const documentDate = new Date();

	const doc = await prisma.deliveryDocument.create({
		data: {
			organizationId: po.organizationId,
			documentType: "DELIVERY_ORDER",
			transferStage: "VENDOR_TO_ADMIN",
			fromParty: "SUPPLIER",
			toParty: "ADMIN",
			documentNumber,
			documentDate,
			purchaseOrderId: po.id,
			supplierId: po.supplierId,
			fromName: po.supplier?.name ?? undefined,
			fromAddress: po.supplier?.address ?? undefined,
			toName: "Admin",
			items: doItems,
		},
	});

	docServiceLogger.info(`Created Supplier DO ${doc.documentNumber} for PO ${po.poNumber}`);
	return { id: doc.id, documentNumber: doc.documentNumber };
};

export type AdminDROptions = {
	receiverName?: string | null;
	receiverSignature?: string | null;
	conditionOfGoods?: string | null;
};

/**
 * Create an Admin Delivery Receipt (DR) when Admin receives goods (VENDOR_TO_ADMIN).
 * Called when marking a Supplier DO as "received" (e.g. POST /deliveryDocument/:id/receive).
 * If an Admin DR already exists for this DO, returns the existing one.
 */
export const createAdminDRForSupplierDO = async (
	prisma: PrismaClient,
	deliveryOrderId: string,
	options?: AdminDROptions,
): Promise<{ id: string; documentNumber: string; deliveryReceipt: any } | null> => {
	const doDoc = await prisma.deliveryDocument.findUnique({
		where: { id: deliveryOrderId },
		include: {
			supplier: { select: { id: true, name: true } },
			purchaseOrder: { select: { id: true, poNumber: true } },
		},
	});

	if (!doDoc) {
		docServiceLogger.warn(`Delivery document (DO) not found: ${deliveryOrderId}`);
		return null;
	}

	if (doDoc.documentType !== "DELIVERY_ORDER" || doDoc.transferStage !== "VENDOR_TO_ADMIN") {
		docServiceLogger.warn(
			`Document ${doDoc.documentNumber} is not a Supplier DO (VENDOR_TO_ADMIN); cannot create Admin DR`,
		);
		return null;
	}

	const existingDR = await prisma.deliveryDocument.findFirst({
		where: {
			correspondingDocumentId: deliveryOrderId,
			documentType: "DELIVERY_RECEIPT",
			transferStage: "VENDOR_TO_ADMIN",
		},
		include: {
			order: { select: { id: true, orderNumber: true } },
			supplier: { select: { id: true, name: true } },
			purchaseOrder: { select: { id: true, poNumber: true } },
			correspondingDo: true,
		},
	});

	if (existingDR) {
		docServiceLogger.info(
			`Admin DR already exists for DO ${doDoc.documentNumber}: ${existingDR.documentNumber}`,
		);
		return {
			id: existingDR.id,
			documentNumber: existingDR.documentNumber,
			deliveryReceipt: existingDR,
		};
	}

	const items = Array.isArray(doDoc.items) ? (doDoc.items as any[]) : [];
	const drItems = items.map((row: any) => ({
		itemId: row.itemId ?? undefined,
		sku: row.sku ?? "",
		description: row.description ?? undefined,
		quantity: typeof row.quantity === "number" ? row.quantity : 1,
	}));

	const documentNumber = await generateAdminDRNumber(prisma);
	const documentDate = new Date();

	const dr = await prisma.deliveryDocument.create({
		data: {
			organizationId: doDoc.organizationId,
			documentType: "DELIVERY_RECEIPT",
			transferStage: "VENDOR_TO_ADMIN",
			fromParty: "SUPPLIER",
			toParty: "ADMIN",
			documentNumber,
			documentDate,
			correspondingDocumentId: doDoc.id,
			purchaseOrderId: doDoc.purchaseOrderId,
			orderId: doDoc.orderId,
			supplierId: doDoc.supplierId,
			fromName: doDoc.fromName,
			fromAddress: doDoc.fromAddress,
			toName: doDoc.toName,
			items: drItems,
			receiverName: options?.receiverName ?? undefined,
			receiverSignature: options?.receiverSignature ?? undefined,
			conditionOfGoods: options?.conditionOfGoods ?? undefined,
		},
		include: {
			order: { select: { id: true, orderNumber: true } },
			supplier: { select: { id: true, name: true } },
			purchaseOrder: { select: { id: true, poNumber: true } },
			correspondingDo: true,
		},
	});

	docServiceLogger.info(
		`Created Admin DR ${dr.documentNumber} for Supplier DO ${doDoc.documentNumber}`,
	);

	// Mark Purchase Order as RECEIVED when Admin has received from supplier
	if (doDoc.purchaseOrderId) {
		await prisma.purchaseOrder.update({
			where: { id: doDoc.purchaseOrderId },
			data: { status: "RECEIVED" },
		});
		docServiceLogger.info(`PurchaseOrder ${doDoc.purchaseOrderId} status set to RECEIVED`);
	}

	return { id: dr.id, documentNumber: dr.documentNumber, deliveryReceipt: dr };
};

export type AdminDOOptions = {
	trackingNumber?: string | null;
	expectedDeliveryDate?: Date | null;
	expectedDeliveryTime?: string | null;
	internalDeliveryPersonnel?: string | null;
	carrierInfo?: string | null;
	toName?: string | null;
	toAddress?: string | null;
	clientUserId?: string | null;
	documentDate?: Date;
};

/**
 * Create an Admin Delivery Order (DO) for dispatching an order to the client (ADMIN_TO_CLIENT).
 * Called via POST /order/:id/dispatch.
 * If an Admin DO already exists for this order, returns the existing one.
 */
export const createAdminDOForOrder = async (
	prisma: PrismaClient,
	orderId: string,
	options?: AdminDOOptions,
): Promise<{ id: string; documentNumber: string; deliveryOrder: any } | null> => {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		include: {
			orderItems: {
				include: { item: { select: { name: true } } },
			},
		},
	});

	if (!order) {
		docServiceLogger.warn(`Order not found: ${orderId}`);
		return null;
	}

	const existing = await prisma.deliveryDocument.findFirst({
		where: {
			orderId,
			documentType: "DELIVERY_ORDER",
			transferStage: "ADMIN_TO_CLIENT",
		},
		select: { id: true, documentNumber: true },
	});
	if (existing) {
		docServiceLogger.info(`Admin DO already exists for order ${order.orderNumber}: ${existing.documentNumber}`);
		const doc = await prisma.deliveryDocument.findUnique({ where: { id: existing.id } });
		return { id: existing.id, documentNumber: existing.documentNumber, deliveryOrder: doc };
	}

	const doItems = (order.orderItems ?? []).map((oi: any) => ({
		itemId: oi.itemId ?? undefined,
		sku: oi.item?.name ?? oi.itemId ?? "",
		description: oi.item?.name ?? undefined,
		quantity: typeof oi.quantity === "number" ? oi.quantity : 1,
	}));

	const documentNumber = await generateAdminDONumber(prisma);
	const documentDate = options?.documentDate ?? new Date();

	const doc = await prisma.deliveryDocument.create({
		data: {
			organizationId: order.organizationId,
			documentType: "DELIVERY_ORDER",
			transferStage: "ADMIN_TO_CLIENT",
			fromParty: "ADMIN",
			toParty: "CLIENT",
			documentNumber,
			documentDate,
			orderId: order.id,
			clientUserId: options?.clientUserId ?? order.userId ?? undefined,
			toName: options?.toName ?? undefined,
			toAddress: options?.toAddress ?? undefined,
			trackingNumber: options?.trackingNumber ?? undefined,
			expectedDeliveryDate: options?.expectedDeliveryDate ?? undefined,
			expectedDeliveryTime: options?.expectedDeliveryTime ?? undefined,
			internalDeliveryPersonnel: options?.internalDeliveryPersonnel ?? undefined,
			carrierInfo: options?.carrierInfo ?? undefined,
			items: doItems,
		},
		include: {
			order: { select: { id: true, orderNumber: true } },
		},
	});

	docServiceLogger.info(`Created Admin DO ${doc.documentNumber} for order ${order.orderNumber}`);
	return { id: doc.id, documentNumber: doc.documentNumber, deliveryOrder: doc };
};

export type ClientDROptions = {
	receiverName?: string | null;
	receiverSignature?: string | null;
	conditionOfGoods?: string | null;
	documentDate?: Date;
};

/**
 * Create a Client Delivery Receipt (DR) when the client confirms receipt (ADMIN_TO_CLIENT).
 * Called via POST /deliveryDocument/:id/confirm-receipt where :id is the Admin DO id.
 * If a Client DR already exists for this DO, returns the existing one.
 */
export const createClientDRForAdminDO = async (
	prisma: PrismaClient,
	adminDOId: string,
	options?: ClientDROptions,
): Promise<{ id: string; documentNumber: string; deliveryReceipt: any } | null> => {
	const doDoc = await prisma.deliveryDocument.findUnique({
		where: { id: adminDOId },
		include: {
			order: { select: { id: true, orderNumber: true } },
		},
	});

	if (!doDoc) {
		docServiceLogger.warn(`Delivery document (Admin DO) not found: ${adminDOId}`);
		return null;
	}

	if (doDoc.documentType !== "DELIVERY_ORDER" || doDoc.transferStage !== "ADMIN_TO_CLIENT") {
		docServiceLogger.warn(
			`Document ${doDoc.documentNumber} is not an Admin DO (ADMIN_TO_CLIENT); cannot create Client DR`,
		);
		return null;
	}

	const existingDR = await prisma.deliveryDocument.findFirst({
		where: {
			correspondingDocumentId: adminDOId,
			documentType: "DELIVERY_RECEIPT",
			transferStage: "ADMIN_TO_CLIENT",
		},
		include: {
			order: { select: { id: true, orderNumber: true } },
			correspondingDo: true,
		},
	});

	if (existingDR) {
		docServiceLogger.info(`Client DR already exists for Admin DO ${doDoc.documentNumber}: ${existingDR.documentNumber}`);
		return { id: existingDR.id, documentNumber: existingDR.documentNumber, deliveryReceipt: existingDR };
	}

	const items = Array.isArray(doDoc.items) ? (doDoc.items as any[]) : [];
	const drItems = items.map((row: any) => ({
		itemId: row.itemId ?? undefined,
		sku: row.sku ?? "",
		description: row.description ?? undefined,
		quantity: typeof row.quantity === "number" ? row.quantity : 1,
	}));

	const documentNumber = await generateClientDRNumber(prisma);
	const documentDate = options?.documentDate ?? new Date();

	const dr = await prisma.deliveryDocument.create({
		data: {
			organizationId: doDoc.organizationId,
			documentType: "DELIVERY_RECEIPT",
			transferStage: "ADMIN_TO_CLIENT",
			fromParty: "ADMIN",
			toParty: "CLIENT",
			documentNumber,
			documentDate,
			correspondingDocumentId: doDoc.id,
			orderId: doDoc.orderId,
			clientUserId: doDoc.clientUserId,
			toName: doDoc.toName,
			toAddress: doDoc.toAddress,
			items: drItems,
			receiverName: options?.receiverName ?? undefined,
			receiverSignature: options?.receiverSignature ?? undefined,
			conditionOfGoods: options?.conditionOfGoods ?? undefined,
		},
		include: {
			order: { select: { id: true, orderNumber: true } },
			correspondingDo: true,
		},
	});

	docServiceLogger.info(`Created Client DR ${dr.documentNumber} for Admin DO ${doDoc.documentNumber}`);
	return { id: dr.id, documentNumber: dr.documentNumber, deliveryReceipt: dr };
};
