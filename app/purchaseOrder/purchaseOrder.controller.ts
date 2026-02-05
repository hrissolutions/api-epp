import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { CreatePurchaseOrderSchema, UpdatePurchaseOrderSchema } from "../../zod/purchaseOrder.zod";
import { config } from "../../config/constant";
import { generatePONumber } from "../../helper/generate-PONumber.helper";
import { createSupplierDOForPO } from "../../helper/deliveryDocumentService";

const logger = getLogger();
const poLogger = logger.child({ module: "purchaseOrder" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = CreatePurchaseOrderSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}
		try {
			const data = validation.data;
			const poNumber = data.poNumber ?? (await generatePONumber(prisma));
			const po = await prisma.purchaseOrder.create({
				data: {
					organizationId: (req as any).organizationId ?? data.organizationId,
					poNumber,
					orderId: data.orderId,
					supplierId: data.supplierId,
					status: data.status ?? "PENDING",
					items: data.items ?? undefined,
					leadTime: data.leadTime ?? undefined,
					availability: data.availability ?? undefined,
					delivery: data.delivery ?? undefined,
					pdc: data.pdc ?? undefined,
					approvedBy: data.approvedBy ?? undefined,
					approvedAt: data.approvedAt ?? undefined,
					sentToSupplierAt: data.sentToSupplierAt ?? undefined,
					notes: data.notes ?? undefined,
				} as any,
				include: {
					order: { select: { orderNumber: true } },
					supplier: { select: { name: true, code: true } },
				},
			});
			poLogger.info(`PurchaseOrder created: ${po.poNumber}`);
			res.status(201).json(
				buildSuccessResponse("Purchase order created", { purchaseOrder: po }, 201),
			);
		} catch (error) {
			poLogger.error(`Create purchase order failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const orderId = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
			const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
			const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
			const skip = (page - 1) * limit;

			const where: Prisma.PurchaseOrderWhereInput = {};
			if (orderId) where.orderId = orderId;
			if ((req as any).organizationId) where.organizationId = (req as any).organizationId;

			const [list, total] = await Promise.all([
				prisma.purchaseOrder.findMany({
					where,
					skip,
					take: limit,
					orderBy: { createdAt: "desc" },
					include: {
						order: { select: { id: true, orderNumber: true } },
						supplier: { select: { id: true, name: true, code: true } },
					},
				}),
				prisma.purchaseOrder.count({ where }),
			]);

			res.status(200).json(
				buildSuccessResponse("Purchase orders retrieved", {
					purchaseOrders: list,
					pagination: buildPagination(total, page, limit),
					count: total,
				}),
			);
		} catch (error) {
			poLogger.error(`Get purchase orders failed: ${error}`);
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
			const po = await prisma.purchaseOrder.findFirst({
				where: { id },
				include: {
					order: { select: { id: true, orderNumber: true, userId: true } },
					supplier: { select: { id: true, name: true, code: true } },
					deliveryDocuments: true,
				},
			});
			if (!po) {
				res.status(404).json(buildErrorResponse("Purchase order not found", 404));
				return;
			}
			res.status(200).json(
				buildSuccessResponse("Purchase order retrieved", { purchaseOrder: po }),
			);
		} catch (error) {
			poLogger.error(`Get purchase order failed: ${error}`);
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
		const validation = UpdatePurchaseOrderSchema.safeParse(req.body);
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
			const po = await prisma.purchaseOrder.update({
				where: { id },
				data: validation.data as any,
				include: {
					order: { select: { orderNumber: true } },
					supplier: { select: { name: true } },
					deliveryDocuments: true,
				},
			});
			// When status is CONFIRMED, ensure a Supplier DO exists (creates only if missing; no duplicate)
			let responsePo: typeof po = po;
			if (validation.data.status === "CONFIRMED") {
				const supplierDo = await createSupplierDOForPO(prisma, id);
				if (supplierDo) {
					poLogger.info(
						`PurchaseOrder ${po.poNumber} CONFIRMED; Supplier DO ${supplierDo.documentNumber} ensured`,
					);
					const refetched = await prisma.purchaseOrder.findFirst({
						where: { id },
						include: {
							order: { select: { orderNumber: true } },
							supplier: { select: { name: true } },
							deliveryDocuments: true,
						},
					});
					if (refetched) responsePo = refetched;
				}
			}
			res.status(200).json(
				buildSuccessResponse("Purchase order updated", { purchaseOrder: responsePo }),
			);
		} catch (error: any) {
			if (error?.code === "P2025") {
				res.status(404).json(buildErrorResponse("Purchase order not found", 404));
				return;
			}
			poLogger.error(`Update purchase order failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const approve = async (req: Request, res: Response, _next: NextFunction) => {
		const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		if (!id) {
			res.status(400).json(buildErrorResponse("ID is required", 400));
			return;
		}
		try {
			const po = await prisma.purchaseOrder.findFirst({
				where: { id },
				include: {
					order: { select: { id: true, orderNumber: true } },
					supplier: { select: { id: true, name: true, code: true } },
					deliveryDocuments: true,
				},
			});
			if (!po) {
				res.status(404).json(buildErrorResponse("Purchase order not found", 404));
				return;
			}
			if (po.status !== "PENDING") {
				res.status(400).json(
					buildErrorResponse(
						`Purchase order cannot be approved: current status is ${po.status}. Only PENDING can be approved.`,
						400,
					),
				);
				return;
			}

			await prisma.purchaseOrder.update({
				where: { id },
				data: {
					status: "APPROVED",
					sentToSupplierAt: new Date(),
				},
			});

			const updated = await prisma.purchaseOrder.findFirst({
				where: { id },
				include: {
					order: { select: { id: true, orderNumber: true } },
					supplier: { select: { id: true, name: true, code: true } },
					deliveryDocuments: true,
				},
			});

			poLogger.info(
				`PurchaseOrder ${po.poNumber} approved (Supplier DO is created when status becomes CONFIRMED)`,
			);

			res.status(200).json(
				buildSuccessResponse("Purchase order approved", {
					purchaseOrder: updated,
				}),
			);
		} catch (error) {
			poLogger.error(`Approve purchase order failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const confirm = async (req: Request, res: Response, _next: NextFunction) => {
		const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		if (!id) {
			res.status(400).json(buildErrorResponse("ID is required", 400));
			return;
		}
		try {
			const po = await prisma.purchaseOrder.findFirst({
				where: { id },
				include: {
					order: { select: { id: true, orderNumber: true } },
					supplier: { select: { id: true, name: true, code: true } },
					deliveryDocuments: true,
				},
			});
			if (!po) {
				res.status(404).json(buildErrorResponse("Purchase order not found", 404));
				return;
			}
			if (po.status !== "APPROVED") {
				res.status(400).json(
					buildErrorResponse(
						`Purchase order cannot be confirmed: current status is ${po.status}. Only APPROVED can be confirmed (then Supplier DO is created).`,
						400,
					),
				);
				return;
			}

			await prisma.purchaseOrder.update({
				where: { id },
				data: { status: "CONFIRMED" },
			});

			const supplierDo = await createSupplierDOForPO(prisma, id);

			const updated = await prisma.purchaseOrder.findFirst({
				where: { id },
				include: {
					order: { select: { id: true, orderNumber: true } },
					supplier: { select: { id: true, name: true, code: true } },
					deliveryDocuments: true,
				},
			});

			poLogger.info(
				`PurchaseOrder ${po.poNumber} confirmed; Supplier DO ${supplierDo?.documentNumber ?? "none"} created`,
			);

			res.status(200).json(
				buildSuccessResponse("Purchase order confirmed; Supplier DO created", {
					purchaseOrder: updated,
					deliveryOrder: supplierDo,
				}),
			);
		} catch (error) {
			poLogger.error(`Confirm purchase order failed: ${error}`);
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
			await prisma.purchaseOrder.delete({ where: { id } });
			res.status(200).json(buildSuccessResponse("Purchase order deleted", {}));
		} catch (error: any) {
			if (error?.code === "P2025") {
				res.status(404).json(buildErrorResponse("Purchase order not found", 404));
				return;
			}
			poLogger.error(`Delete purchase order failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	return { create, getAll, getById, update, remove, approve, confirm };
};
