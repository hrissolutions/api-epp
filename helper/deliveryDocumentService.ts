import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";
import {
	generateSupplierDONumber,
	generateAdminDRNumber,
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
