import { NextFunction, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { PrismaClient, Prisma } from "../../generated/prisma";
import {
	CreateAdminSupplierSettlementStandaloneSchema,
	UpdateAdminSupplierSettlementSchema,
} from "../../zod/supplierSettlement.zod";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { buildSuccessResponse } from "../../helper/success-handler";
import { uploadReceiptToCloudinary } from "../../helper/cloudinaryUpload";

export const controller = (prisma: PrismaClient) => {
	const getAll = async (_req: Request, res: Response, _next: NextFunction) => {
		const rows = await (prisma as any).adminSupplierSettlement.findMany({
			orderBy: { createdAt: "desc" },
			include: {
				supplierSettlement: {
					select: {
						id: true,
						orderId: true,
						purchaseOrderId: true,
						supplierId: true,
						amount: true,
						order: { select: { orderNumber: true } },
						purchaseOrder: { select: { poNumber: true } },
					},
				},
			},
		});
		res.status(200).json(
			buildSuccessResponse("Admin supplier settlements (remittances) retrieved", rows, 200),
		);
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const row = await (prisma as any).adminSupplierSettlement.findFirst({
			where: { id },
			include: {
				supplierSettlement: {
					select: {
						id: true,
						orderId: true,
						purchaseOrderId: true,
						supplierId: true,
						amount: true,
						order: { select: { orderNumber: true } },
						purchaseOrder: { select: { poNumber: true } },
					},
				},
			},
		});
		if (!row) {
			res.status(404).json(buildErrorResponse("Admin supplier settlement not found", 404));
			return;
		}
		res.status(200).json(buildSuccessResponse("Admin supplier settlement retrieved", row, 200));
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const body =
			req.body?.amount != null && typeof req.body.amount !== "number"
				? { ...req.body, amount: Number(req.body.amount) }
				: req.body;
		const parsed = CreateAdminSupplierSettlementStandaloneSchema.safeParse(body);
		if (!parsed.success) {
			res.status(400).json(
				buildErrorResponse(
					"Validation failed",
					400,
					formatZodErrors(parsed.error.format()),
				),
			);
			return;
		}
		const settlement = await prisma.supplierSettlement.findFirst({
			where: { id: parsed.data.supplierSettlementId },
		});
		if (!settlement) {
			res.status(404).json(buildErrorResponse("Supplier settlement not found", 404));
			return;
		}
		const createData: Record<string, unknown> = {
			...parsed.data,
			organizationId: (req as any).organizationId ?? parsed.data.organizationId ?? null,
		};
		if (
			parsed.data.createdBy == null ||
			parsed.data.createdBy === "" ||
			!isValidObjectId(parsed.data.createdBy)
		) {
			delete createData.createdBy;
		}
		let record = await (prisma as any).adminSupplierSettlement.create({
			data: createData,
		});
		const file = req.file;
		if (file) {
			const uploadResult = await uploadReceiptToCloudinary(file, {
				folder: "admin-supplier-remittance-receipts",
			});
			if (uploadResult.success && uploadResult.secureUrl) {
				record = await (prisma as any).adminSupplierSettlement.update({
					where: { id: record.id },
					data: {
						receiptAttachmentUrl: uploadResult.secureUrl,
						...(parsed.data.receiptType != null && {
							receiptType: parsed.data.receiptType,
						}),
						...(parsed.data.receiptNumber != null && {
							receiptNumber: parsed.data.receiptNumber,
						}),
					},
				});
			}
		}
		// Update parent SupplierSettlement reconciliation status
		const aggregate = await (prisma as any).adminSupplierSettlement.aggregate({
			where: { supplierSettlementId: settlement.id },
			_sum: { amount: true },
		});
		const totalRemitted = Number(aggregate?._sum?.amount ?? 0);
		const nextReconciliationStatus = totalRemitted >= settlement.amount ? "SETTLED" : "PARTIAL";
		const updateData: Prisma.SupplierSettlementUpdateInput = {
			reconciliationStatus: nextReconciliationStatus,
			reconciledAt: new Date(),
		};
		if (settlement.status === "PENDING") {
			updateData.status = totalRemitted >= settlement.amount ? "PAID" : "PARTIAL";
			updateData.paidAt = parsed.data.remittedAt ?? new Date();
		}
		await prisma.supplierSettlement.update({
			where: { id: settlement.id },
			data: updateData,
		});
		res.status(201).json(
			buildSuccessResponse(
				"Admin to supplier remittance created",
				{
					adminSupplierSettlement: record,
					summary: {
						supplierSettlementId: settlement.id,
						settlementAmount: settlement.amount,
						totalRemitted,
						outstanding: Math.max(settlement.amount - totalRemitted, 0),
						reconciliationStatus: nextReconciliationStatus,
					},
				},
				201,
			),
		);
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const rawBody = req.body ?? {};
		const body =
			rawBody?.amount != null && typeof rawBody.amount !== "number"
				? { ...rawBody, amount: Number(rawBody.amount) }
				: rawBody;
		const parsed = UpdateAdminSupplierSettlementSchema.safeParse(body);
		if (!parsed.success) {
			res.status(400).json(
				buildErrorResponse(
					"Validation failed",
					400,
					formatZodErrors(parsed.error.format()),
				),
			);
			return;
		}
		const existing = await (prisma as any).adminSupplierSettlement.findFirst({
			where: { id },
		});
		if (!existing) {
			res.status(404).json(buildErrorResponse("Admin supplier settlement not found", 404));
			return;
		}
		let updateData = { ...parsed.data } as any;
		const file = req.file;
		if (file) {
			const uploadResult = await uploadReceiptToCloudinary(file, {
				folder: "admin-supplier-remittance-receipts",
			});
			if (uploadResult.success && uploadResult.secureUrl) {
				updateData.receiptAttachmentUrl = uploadResult.secureUrl;
				if (rawBody.receiptType === "OR" || rawBody.receiptType === "BANK_RECEIPT") {
					updateData.receiptType = rawBody.receiptType;
				}
				if (rawBody.receiptNumber != null && rawBody.receiptNumber !== "") {
					updateData.receiptNumber = rawBody.receiptNumber;
				}
			}
		}
		const updated = await (prisma as any).adminSupplierSettlement.update({
			where: { id },
			data: updateData,
		});
		// Sync receipt/reference to parent SupplierSettlement so ledger and parent stay in sync
		const supplierSettlementUpdate: Record<string, unknown> = {};
		if (updated.receiptType != null) supplierSettlementUpdate.receiptType = updated.receiptType;
		if (updated.receiptNumber != null)
			supplierSettlementUpdate.receiptNumber = updated.receiptNumber;
		if (updated.receiptAttachmentUrl != null)
			supplierSettlementUpdate.receiptAttachmentUrl = updated.receiptAttachmentUrl;
		if (updated.referenceNo != null) supplierSettlementUpdate.referenceNo = updated.referenceNo;
		if (Object.keys(supplierSettlementUpdate).length > 0) {
			await prisma.supplierSettlement.update({
				where: { id: existing.supplierSettlementId },
				data: supplierSettlementUpdate as Prisma.SupplierSettlementUpdateInput,
			});
		}
		res.status(200).json(
			buildSuccessResponse("Admin supplier settlement updated", updated, 200),
		);
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const existing = await (prisma as any).adminSupplierSettlement.findFirst({
			where: { id },
		});
		if (!existing) {
			res.status(404).json(buildErrorResponse("Admin supplier settlement not found", 404));
			return;
		}
		await (prisma as any).adminSupplierSettlement.delete({ where: { id } });
		// Recompute parent SupplierSettlement status
		const settlement = await prisma.supplierSettlement.findFirst({
			where: { id: existing.supplierSettlementId },
		});
		if (settlement) {
			const aggregate = await (prisma as any).adminSupplierSettlement.aggregate({
				where: { supplierSettlementId: settlement.id },
				_sum: { amount: true },
			});
			const totalRemitted = Number(aggregate?._sum?.amount ?? 0);
			const removeUpdateData: Prisma.SupplierSettlementUpdateInput = {
				status:
					totalRemitted >= settlement.amount
						? "PAID"
						: totalRemitted > 0
							? "PARTIAL"
							: "PENDING",
				paidAt: totalRemitted >= settlement.amount ? settlement.updatedAt : null,
				reconciliationStatus:
					totalRemitted >= settlement.amount
						? "SETTLED"
						: totalRemitted > 0
							? "PARTIAL"
							: "PENDING",
				reconciledAt: new Date(),
			};
			await prisma.supplierSettlement.update({
				where: { id: settlement.id },
				data: removeUpdateData,
			});
		}
		res.status(200).json(buildSuccessResponse("Admin supplier settlement deleted", {}, 200));
	};

	return { getAll, getById, create, update, remove };
};
