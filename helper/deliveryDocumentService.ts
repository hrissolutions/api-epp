import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";
import { generateVendorDONumber } from "./generate-DeliveryDocumentNumber.helper";

const logger = getLogger();
const docServiceLogger = logger.child({ module: "deliveryDocumentService" });

/**
 * Create a Vendor Delivery Order (DO) for an approved Purchase Order.
 * Called when PO status is set to APPROVED.
 */
export const createVendorDOForPO = async (
	prisma: PrismaClient,
	purchaseOrderId: string,
): Promise<{ id: string; documentNumber: string } | null> => {
	const po = await prisma.purchaseOrder.findUnique({
		where: { id: purchaseOrderId },
		include: {
			vendor: { select: { id: true, name: true } },
			order: { select: { id: true } },
		},
	});

	if (!po) {
		docServiceLogger.warn(`PurchaseOrder not found: ${purchaseOrderId}`);
		return null;
	}

	// Avoid duplicate Vendor DO for this PO
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
			`Vendor DO already exists for PO ${po.poNumber}: ${existing.documentNumber}`,
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
		docServiceLogger.warn(`PO ${po.poNumber} has no items, skipping Vendor DO creation`);
		return null;
	}

	const documentNumber = await generateVendorDONumber(prisma);
	const documentDate = new Date();

	const doc = await prisma.deliveryDocument.create({
		data: {
			organizationId: po.organizationId,
			documentType: "DELIVERY_ORDER",
			transferStage: "VENDOR_TO_ADMIN",
			documentNumber,
			documentDate,
			purchaseOrderId: po.id,
			vendorId: po.vendorId,
			toName: "Admin",
			items: doItems,
		},
	});

	docServiceLogger.info(`Created Vendor DO ${doc.documentNumber} for PO ${po.poNumber}`);
	return { id: doc.id, documentNumber: doc.documentNumber };
};
