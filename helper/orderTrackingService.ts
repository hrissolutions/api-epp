import { PrismaClient, OrderStatus } from "../generated/prisma";
import { getLogger } from "./logger";

const logger = getLogger();
const trackingLogger = logger.child({ module: "orderTrackingService" });

export type TrackingStage =
	| "ORDER_CREATED"
	| "ORDER_APPROVED"
	| "PURCHASE_ORDER_CREATED"
	| "SUPPLIER_DELIVERY_ORDER" // Supplier → Admin (DO)
	| "ADMIN_RECEIVED_FROM_SUPPLIER" // Admin DR
	| "ADMIN_DELIVERY_ORDER" // Admin → Client (DO)
	| "CLIENT_RECEIVED"; // Client DR

export type TrackingEvent = {
	stage: TrackingStage;
	label: string;
	description: string;
	date: Date | null;
	referenceId?: string;
	referenceNumber?: string;
	metadata?: Record<string, unknown>;
};

/** User-facing "where is my order" stage derived from delivery documents (DeliveryOrder / DeliveryReceipt). */
export type CurrentStage =
	| "ORDER_PLACED"
	| "ORDER_APPROVED"
	| "PURCHASE_ORDER_CREATED"
	| "SUPPLIER_DELIVERY_ORDER" // Supplier → Admin (DO)
	| "ADMIN_RECEIVED_FROM_SUPPLIER" // Admin DR
	| "ADMIN_DELIVERY_ORDER" // Admin → Client (DO)
	| "CLIENT_RECEIVED" // Client DR
	| "CANCELLED"
	| "REJECTED"
	| "RETURNED";

export const CURRENT_STAGE_LABELS: Record<CurrentStage, string> = {
	ORDER_PLACED: "Order placed",
	ORDER_APPROVED: "Order approved",
	PURCHASE_ORDER_CREATED: "Being prepared",
	SUPPLIER_DELIVERY_ORDER: "Being prepared",
	ADMIN_RECEIVED_FROM_SUPPLIER: "Being prepared",
	ADMIN_DELIVERY_ORDER: "Out for delivery to you",
	CLIENT_RECEIVED: "Delivered",
	CANCELLED: "Cancelled",
	REJECTED: "Rejected",
	RETURNED: "Returned",
};

/** Minimal order shape needed to compute current delivery stage from already-loaded data (no DB call). */
export type OrderDataForStage = {
	status: string;
	approvedAt?: Date | null;
	deliveryDocuments?: Array<{ documentType: string; transferStage: string }>;
	purchaseOrders?: Array<{
		deliveryDocuments?: Array<{ documentType: string; transferStage: string }>;
	}>;
};

/**
 * Compute the current delivery stage for an order from already-loaded data.
 * Use when order + delivery docs are already included — avoids an extra DB round-trip.
 */
export function computeOrderCurrentStage(order: OrderDataForStage): {
	currentStage: CurrentStage;
	currentStageLabel: string;
} {
	if (order.status === "CANCELLED")
		return { currentStage: "CANCELLED", currentStageLabel: CURRENT_STAGE_LABELS.CANCELLED };
	if (order.status === "REJECTED")
		return { currentStage: "REJECTED", currentStageLabel: CURRENT_STAGE_LABELS.REJECTED };
	if (order.status === "RETURNED")
		return { currentStage: "RETURNED", currentStageLabel: CURRENT_STAGE_LABELS.RETURNED };

	const deliveryDocs = order.deliveryDocuments ?? [];
	const purchaseOrders = order.purchaseOrders ?? [];

	const hasClientDr = deliveryDocs.some(
		(d) => d.documentType === "DELIVERY_RECEIPT" && d.transferStage === "ADMIN_TO_CLIENT",
	);
	const hasAdminDo = deliveryDocs.some(
		(d) => d.documentType === "DELIVERY_ORDER" && d.transferStage === "ADMIN_TO_CLIENT",
	);
	const allPosReceived =
		purchaseOrders.length > 0 &&
		purchaseOrders.every((po) =>
			po.deliveryDocuments?.some(
				(d) => d.documentType === "DELIVERY_RECEIPT" && d.transferStage === "VENDOR_TO_ADMIN",
			),
		);
	const hasAnySupplierDo = purchaseOrders.some((po) =>
		po.deliveryDocuments?.some(
			(d) => d.documentType === "DELIVERY_ORDER" && d.transferStage === "VENDOR_TO_ADMIN",
		),
	);
	const hasAnyPo = purchaseOrders.length > 0;

	let currentStage: CurrentStage;
	if (hasClientDr) currentStage = "CLIENT_RECEIVED";
	else if (hasAdminDo) currentStage = "ADMIN_DELIVERY_ORDER";
	else if (allPosReceived) currentStage = "ADMIN_RECEIVED_FROM_SUPPLIER";
	else if (hasAnySupplierDo) currentStage = "SUPPLIER_DELIVERY_ORDER";
	else if (hasAnyPo) currentStage = "PURCHASE_ORDER_CREATED";
	else if (order.approvedAt) currentStage = "ORDER_APPROVED";
	else currentStage = "ORDER_PLACED";

	return { currentStage, currentStageLabel: CURRENT_STAGE_LABELS[currentStage] };
}

/**
 * Build the full tracking timeline for an order: creation → approval → PO(s) → Supplier DO →
 * Admin DR → Admin DO → Client DR. Used for GET /order/:id/tracking.
 * Includes currentStage/currentStageLabel so the user who ordered sees where the order is (based on deliveryOrder/deliveryReceipt).
 */
export async function getOrderTrackingTimeline(
	prisma: PrismaClient,
	orderId: string,
): Promise<{
	orderId: string;
	orderNumber: string;
	status: string;
	currentStage: CurrentStage;
	currentStageLabel: string;
	tracking: TrackingEvent[];
}> {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: {
			id: true,
			orderNumber: true,
			status: true,
			orderDate: true,
			approvedAt: true,
			shippedDate: true,
			deliveredDate: true,
			trackingNumber: true,
			purchaseOrders: {
				orderBy: { createdAt: "asc" },
				select: {
					id: true,
					poNumber: true,
					status: true,
					createdAt: true,
					sentToSupplierAt: true,
					supplier: { select: { name: true, code: true } },
					deliveryDocuments: {
						orderBy: { documentDate: "asc" },
						select: {
							id: true,
							documentType: true,
							transferStage: true,
							documentNumber: true,
							documentDate: true,
							documentTime: true,
							trackingNumber: true,
							receiverName: true,
						},
					},
				},
			},
			deliveryDocuments: {
				where: { orderId },
				orderBy: { documentDate: "asc" },
				select: {
					id: true,
					documentType: true,
					transferStage: true,
					documentNumber: true,
					documentDate: true,
					documentTime: true,
					trackingNumber: true,
					receiverName: true,
				},
			},
		},
	});

	if (!order) {
		return {
			orderId,
			orderNumber: "",
			status: "",
			currentStage: "ORDER_PLACED",
			currentStageLabel: CURRENT_STAGE_LABELS.ORDER_PLACED,
			tracking: [],
		};
	}

	const events: TrackingEvent[] = [];

	// 1. Order created
	events.push({
		stage: "ORDER_CREATED",
		label: "Order created",
		description: `Order ${order.orderNumber} was placed.`,
		date: order.orderDate,
		referenceId: order.id,
		referenceNumber: order.orderNumber,
	});

	// 2. Order approved
	if (order.approvedAt) {
		events.push({
			stage: "ORDER_APPROVED",
			label: "Order approved",
			description: "Your order has been approved and is being processed.",
			date: order.approvedAt,
			referenceId: order.id,
		});
	}

	// 3. Purchase order(s) created and their delivery chain
	for (const po of order.purchaseOrders) {
		events.push({
			stage: "PURCHASE_ORDER_CREATED",
			label: "Being prepared",
			description: "Your order is being prepared.",
			date: po.createdAt,
			referenceId: po.id,
		});

		// Supplier DO (Supplier → Admin)
		const supplierDo = po.deliveryDocuments?.find(
			(d) => d.documentType === "DELIVERY_ORDER" && d.transferStage === "VENDOR_TO_ADMIN",
		);
		if (supplierDo) {
			events.push({
				stage: "SUPPLIER_DELIVERY_ORDER",
				label: "Being prepared",
				description: "Your order is being prepared.",
				date: supplierDo.documentDate,
				referenceId: supplierDo.id,
			});
		}

		// Admin DR (Admin received from supplier)
		const adminDr = po.deliveryDocuments?.find(
			(d) =>
				d.documentType === "DELIVERY_RECEIPT" && d.transferStage === "VENDOR_TO_ADMIN",
		);
		if (adminDr) {
			events.push({
				stage: "ADMIN_RECEIVED_FROM_SUPPLIER",
				label: "Being prepared",
				description: "Your order is being prepared.",
				date: adminDr.documentDate,
				referenceId: adminDr.id,
			});
		}
	}

	// 4. Admin DO (Admin → Client) and Client DR — from order.deliveryDocuments (orderId set)
	const adminDoList = order.deliveryDocuments?.filter(
		(d) =>
			d.documentType === "DELIVERY_ORDER" && d.transferStage === "ADMIN_TO_CLIENT",
	) ?? [];
	const clientDrList = order.deliveryDocuments?.filter(
		(d) =>
			d.documentType === "DELIVERY_RECEIPT" && d.transferStage === "ADMIN_TO_CLIENT",
	) ?? [];

	for (const doDoc of adminDoList) {
		events.push({
			stage: "ADMIN_DELIVERY_ORDER",
			label: "Out for delivery to you",
			description: "Your order is on its way to you.",
			date: doDoc.documentDate,
			referenceId: doDoc.id,
			metadata: {
				trackingNumber: doDoc.trackingNumber ?? order.trackingNumber ?? undefined,
			},
		});
	}

	for (const dr of clientDrList) {
		events.push({
			stage: "CLIENT_RECEIVED",
			label: "Delivered",
			description: "Your order has been delivered.",
			date: dr.documentDate,
			referenceId: dr.id,
		});
	}

	// Sort by date
	events.sort((a, b) => {
		if (!a.date) return 1;
		if (!b.date) return -1;
		return new Date(a.date).getTime() - new Date(b.date).getTime();
	});

	// Current stage for the user who ordered: based on delivery documents (orderId in deliveryOrder/deliveryReceipt)
	const hasClientDr =
		(clientDrList?.length ?? 0) > 0;
	const hasAdminDo = (adminDoList?.length ?? 0) > 0;
	const allPosReceived =
		order.purchaseOrders.length > 0 &&
		order.purchaseOrders.every((po) => {
			const adminDr = po.deliveryDocuments?.find(
				(d) =>
					d.documentType === "DELIVERY_RECEIPT" && d.transferStage === "VENDOR_TO_ADMIN",
			);
			return !!adminDr;
		});
	const hasAnySupplierDo = order.purchaseOrders.some((po) =>
		po.deliveryDocuments?.some(
			(d) =>
				d.documentType === "DELIVERY_ORDER" && d.transferStage === "VENDOR_TO_ADMIN",
		),
	);
	const hasAnyPo = order.purchaseOrders.length > 0;

	let currentStage: CurrentStage;
	if (hasClientDr) currentStage = "CLIENT_RECEIVED";
	else if (hasAdminDo) currentStage = "ADMIN_DELIVERY_ORDER";
	else if (allPosReceived) currentStage = "ADMIN_RECEIVED_FROM_SUPPLIER";
	else if (hasAnySupplierDo) currentStage = "SUPPLIER_DELIVERY_ORDER";
	else if (hasAnyPo) currentStage = "PURCHASE_ORDER_CREATED";
	else if (order.approvedAt) currentStage = "ORDER_APPROVED";
	else currentStage = "ORDER_PLACED";

	return {
		orderId: order.id,
		orderNumber: order.orderNumber,
		status: order.status,
		currentStage,
		currentStageLabel: CURRENT_STAGE_LABELS[currentStage],
		tracking: events,
	};
}

/**
 * Sync Order.status (and shippedDate/deliveredDate) based on delivery documents.
 * Call after creating or updating delivery documents.
 * - When Admin DR exists for all POs of the order → Order PROCESSING (optional, if not already past APPROVED)
 * - When Admin DO (ADMIN_TO_CLIENT) exists for the order → Order SHIPPED, shippedDate set
 * - When Client DR exists for the order → Order DELIVERED, deliveredDate set
 */
export async function syncOrderStatusFromDeliveryDocuments(
	prisma: PrismaClient,
	orderId: string,
): Promise<{ updated: boolean; newStatus?: string }> {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: {
			id: true,
			status: true,
			shippedDate: true,
			deliveredDate: true,
			purchaseOrders: {
				select: {
					id: true,
					deliveryDocuments: {
						where: {
							documentType: "DELIVERY_RECEIPT",
							transferStage: "VENDOR_TO_ADMIN",
						},
						select: { id: true },
					},
				},
			},
			deliveryDocuments: {
				where: { orderId },
				select: {
					documentType: true,
					transferStage: true,
					documentDate: true,
				},
			},
		},
	});

	if (!order) return { updated: false };

	const clientDr = order.deliveryDocuments?.find(
		(d) =>
			d.documentType === "DELIVERY_RECEIPT" && d.transferStage === "ADMIN_TO_CLIENT",
	);
	const adminDo = order.deliveryDocuments?.find(
		(d) =>
			d.documentType === "DELIVERY_ORDER" && d.transferStage === "ADMIN_TO_CLIENT",
	);

	const allPosReceived =
		order.purchaseOrders.length > 0 &&
		order.purchaseOrders.every((po) => po.deliveryDocuments && po.deliveryDocuments.length > 0);

	let newStatus: OrderStatus | undefined;
	const updates: {
		status?: OrderStatus;
		shippedDate?: Date;
		deliveredDate?: Date;
	} = {};

	// Client DR → DELIVERED
	if (clientDr) {
		if (order.status !== "DELIVERED" || !order.deliveredDate) {
			newStatus = OrderStatus.DELIVERED;
			updates.status = OrderStatus.DELIVERED;
			updates.deliveredDate = clientDr.documentDate
				? new Date(clientDr.documentDate)
				: new Date();
		}
	}
	// Admin DO (to client) → SHIPPED (only if not yet DELIVERED)
	else if (adminDo && order.status !== "DELIVERED") {
		if (order.status !== "SHIPPED" || !order.shippedDate) {
			newStatus = OrderStatus.SHIPPED;
			updates.status = OrderStatus.SHIPPED;
			updates.shippedDate = adminDo.documentDate
				? new Date(adminDo.documentDate)
				: new Date();
		}
	}
	// All POs received (Admin DR) and order still APPROVED → PROCESSING
	else if (allPosReceived && order.status === "APPROVED") {
		newStatus = OrderStatus.PROCESSING;
		updates.status = OrderStatus.PROCESSING;
	}

	if (Object.keys(updates).length === 0) return { updated: false };

	await prisma.order.update({
		where: { id: orderId },
		data: updates,
	});
	trackingLogger.info(
		`Order ${orderId} status synced to ${updates.status} (shippedDate/deliveredDate updated from delivery docs)`,
	);
	return { updated: true, newStatus: updates.status };
}
