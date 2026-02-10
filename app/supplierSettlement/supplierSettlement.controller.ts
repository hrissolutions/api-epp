import { NextFunction, Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma";
import {
	CreateSupplierSettlementSchema,
	ReconcileSupplierSettlementSchema,
	UpdateSupplierSettlementSchema,
} from "../../zod/supplierSettlement.zod";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { buildSuccessResponse } from "../../helper/success-handler";

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const parsed = CreateSupplierSettlementSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json(
				buildErrorResponse("Validation failed", 400, formatZodErrors(parsed.error.format())),
			);
			return;
		}
		const record = await prisma.supplierSettlement.create({
			data: {
				...parsed.data,
				organizationId: (req as any).organizationId ?? parsed.data.organizationId,
			} as any,
		});
		res.status(201).json(buildSuccessResponse("Supplier settlement created", record, 201));
	};

	const getAll = async (_req: Request, res: Response, _next: NextFunction) => {
		const rows = await prisma.supplierSettlement.findMany({
			orderBy: { createdAt: "desc" },
		});
		res.status(200).json(buildSuccessResponse("Supplier settlements retrieved", rows, 200));
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const row = await prisma.supplierSettlement.findFirst({ where: { id } });
		if (!row) {
			res.status(404).json(buildErrorResponse("Supplier settlement not found", 404));
			return;
		}
		res.status(200).json(buildSuccessResponse("Supplier settlement retrieved", row, 200));
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const parsed = UpdateSupplierSettlementSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json(
				buildErrorResponse("Validation failed", 400, formatZodErrors(parsed.error.format())),
			);
			return;
		}
		const existing = await prisma.supplierSettlement.findFirst({ where: { id } });
		if (!existing) {
			res.status(404).json(buildErrorResponse("Supplier settlement not found", 404));
			return;
		}
		const updated = await prisma.supplierSettlement.update({
			where: { id },
			data: parsed.data as any,
		});
		res.status(200).json(buildSuccessResponse("Supplier settlement updated", updated, 200));
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const existing = await prisma.supplierSettlement.findFirst({ where: { id } });
		if (!existing) {
			res.status(404).json(buildErrorResponse("Supplier settlement not found", 404));
			return;
		}
		await prisma.supplierSettlement.delete({ where: { id } });
		res.status(200).json(buildSuccessResponse("Supplier settlement deleted", {}, 200));
	};

	const reconcile = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const parsed = ReconcileSupplierSettlementSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json(
				buildErrorResponse("Validation failed", 400, formatZodErrors(parsed.error.format())),
			);
			return;
		}
		const existing = await prisma.supplierSettlement.findFirst({ where: { id } });
		if (!existing) {
			res.status(404).json(buildErrorResponse("Supplier settlement not found", 404));
			return;
		}
		const updated = await prisma.supplierSettlement.update({
			where: { id },
			data: {
				reconciliationStatus: parsed.data.status,
				reconciledAt: new Date(),
				reconciledBy: parsed.data.reconciledBy,
				notes: parsed.data.notes ?? existing.notes,
			},
		});
		res.status(200).json(buildSuccessResponse("Supplier settlement reconciled", updated, 200));
	};

	return { create, getAll, getById, update, remove, reconcile };
};

