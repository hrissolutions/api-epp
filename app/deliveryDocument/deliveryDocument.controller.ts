import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	CreateDeliveryDocumentSchema,
	UpdateDeliveryDocumentSchema,
} from "../../zod/deliveryDocument.zod";
import { config } from "../../config/constant";

const logger = getLogger();
const docLogger = logger.child({ module: "deliveryDocument" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = CreateDeliveryDocumentSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}
		try {
			const data = validation.data;
			const doc = await prisma.deliveryDocument.create({
				data: {
					organizationId: (req as any).organizationId ?? data.organizationId,
					documentType: data.documentType,
					transferStage: data.transferStage,
					documentNumber: data.documentNumber,
					documentDate: data.documentDate,
					documentTime: data.documentTime ?? undefined,
					correspondingDocumentId: data.correspondingDocumentId ?? undefined,
					purchaseOrderId: data.purchaseOrderId ?? undefined,
					orderId: data.orderId ?? undefined,
					vendorId: data.vendorId ?? undefined,
					fromLocation: data.fromLocation ?? undefined,
					toName: data.toName ?? undefined,
					toAddress: data.toAddress ?? undefined,
					clientUserId: data.clientUserId ?? undefined,
					carrierInfo: data.carrierInfo ?? undefined,
					trackingNumber: data.trackingNumber ?? undefined,
					expectedDeliveryDate: data.expectedDeliveryDate ?? undefined,
					expectedDeliveryTime: data.expectedDeliveryTime ?? undefined,
					internalDeliveryPersonnel: data.internalDeliveryPersonnel ?? undefined,
					receiverName: data.receiverName ?? undefined,
					receiverSignature: data.receiverSignature ?? undefined,
					conditionOfGoods: data.conditionOfGoods ?? undefined,
					items: data.items,
				},
				include: {
					order: { select: { id: true, orderNumber: true } },
					vendor: { select: { id: true, name: true } },
					purchaseOrder: { select: { id: true, poNumber: true } },
				},
			});
			docLogger.info(
				`DeliveryDocument created: ${doc.documentNumber} (${doc.documentType}/${doc.transferStage})`,
			);
			res.status(201).json(
				buildSuccessResponse("Delivery document created", { deliveryDocument: doc }, 201),
			);
		} catch (error: any) {
			if (error?.code === "P2002") {
				res.status(409).json(buildErrorResponse("Document number already exists", 409));
				return;
			}
			docLogger.error(`Create delivery document failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const orderId = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
			const purchaseOrderId =
				typeof req.query.purchaseOrderId === "string"
					? req.query.purchaseOrderId
					: undefined;
			const documentType =
				typeof req.query.documentType === "string" &&
				["DELIVERY_ORDER", "DELIVERY_RECEIPT"].includes(req.query.documentType)
					? (req.query.documentType as "DELIVERY_ORDER" | "DELIVERY_RECEIPT")
					: undefined;
			const transferStage =
				typeof req.query.transferStage === "string" &&
				["VENDOR_TO_ADMIN", "ADMIN_TO_CLIENT"].includes(req.query.transferStage)
					? (req.query.transferStage as "VENDOR_TO_ADMIN" | "ADMIN_TO_CLIENT")
					: undefined;
			const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
			const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
			const skip = (page - 1) * limit;

			const where: Prisma.DeliveryDocumentWhereInput = {};
			if (orderId) where.orderId = orderId;
			if (purchaseOrderId) where.purchaseOrderId = purchaseOrderId;
			if (documentType) where.documentType = documentType;
			if (transferStage) where.transferStage = transferStage;
			if ((req as any).organizationId) where.organizationId = (req as any).organizationId;

			const [list, total] = await Promise.all([
				prisma.deliveryDocument.findMany({
					where,
					skip,
					take: limit,
					orderBy: { documentDate: "desc" },
					include: {
						order: { select: { id: true, orderNumber: true } },
						vendor: { select: { id: true, name: true } },
						purchaseOrder: { select: { id: true, poNumber: true } },
					},
				}),
				prisma.deliveryDocument.count({ where }),
			]);

			res.status(200).json(
				buildSuccessResponse("Delivery documents retrieved", {
					deliveryDocuments: list,
					pagination: buildPagination(total, page, limit),
					count: total,
				}),
			);
		} catch (error) {
			docLogger.error(`Get delivery documents failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		if (!id) {
			res.status(400).json(buildErrorResponse("ID is required", 400));
			return;
		}
		try {
			const doc = await prisma.deliveryDocument.findFirst({
				where: { id },
				include: {
					order: { select: { id: true, orderNumber: true } },
					vendor: { select: { id: true, name: true } },
					purchaseOrder: { select: { id: true, poNumber: true } },
					correspondingDo: true,
					receiptsForThisDo: true,
				},
			});
			if (!doc) {
				res.status(404).json(buildErrorResponse("Delivery document not found", 404));
				return;
			}
			res.status(200).json(
				buildSuccessResponse("Delivery document retrieved", { deliveryDocument: doc }),
			);
		} catch (error) {
			docLogger.error(`Get delivery document failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		if (!id) {
			res.status(400).json(buildErrorResponse("ID is required", 400));
			return;
		}
		const validation = UpdateDeliveryDocumentSchema.safeParse(req.body);
		if (!validation.success) {
			res.status(400).json(
				buildErrorResponse(
					"Validation failed",
					400,
					formatZodErrors(validation.error.format()),
				),
			);
			return;
		}
		try {
			const doc = await prisma.deliveryDocument.update({
				where: { id },
				data: validation.data,
				include: {
					order: { select: { orderNumber: true } },
					vendor: { select: { name: true } },
				},
			});
			res.status(200).json(
				buildSuccessResponse("Delivery document updated", { deliveryDocument: doc }),
			);
		} catch (error: any) {
			if (error?.code === "P2025") {
				res.status(404).json(buildErrorResponse("Delivery document not found", 404));
				return;
			}
			docLogger.error(`Update delivery document failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		if (!id) {
			res.status(400).json(buildErrorResponse("ID is required", 400));
			return;
		}
		try {
			await prisma.deliveryDocument.delete({ where: { id } });
			res.status(200).json(buildSuccessResponse("Delivery document deleted", {}));
		} catch (error: any) {
			if (error?.code === "P2025") {
				res.status(404).json(buildErrorResponse("Delivery document not found", 404));
				return;
			}
			docLogger.error(`Delete delivery document failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	return { create, getAll, getById, update, remove };
};
