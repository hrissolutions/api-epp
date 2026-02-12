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
	const parseAmountFromMetadata = (metadata: unknown): number | null => {
		if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
			return null;
		}
		const record = metadata as Record<string, unknown>;
		const candidates = [record.paidAmount, record.paymentAmount, record.amountPaid];
		for (const value of candidates) {
			if (typeof value === "number" && Number.isFinite(value) && value > 0) {
				return value;
			}
			if (typeof value === "string") {
				const parsed = Number(value);
				if (Number.isFinite(parsed) && parsed > 0) {
					return parsed;
				}
			}
		}
		return null;
	};

	const resolveCreditAmount = (row: { amount: number; status: string; metadata: unknown }) => {
		if (row.status === "PAID") {
			return row.amount;
		}
		if (row.status === "PARTIAL") {
			const metadataAmount = parseAmountFromMetadata(row.metadata);
			if (metadataAmount !== null) {
				return Math.min(metadataAmount, row.amount);
			}
			return row.amount;
		}
		return 0;
	};

	const getAdminToSupplierSoa = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const rawSupplierId = req.params.supplierId;
		const supplierId = Array.isArray(rawSupplierId) ? rawSupplierId[0] : rawSupplierId;

		const rows = await prisma.supplierSettlement.findMany({
			where: { supplierId },
			orderBy: { createdAt: "asc" },
			include: {
				order: {
					select: {
						orderNumber: true,
					},
				},
				purchaseOrder: {
					select: {
						poNumber: true,
					},
				},
			},
		});

		type RawEntry = {
			date: Date;
			description: string;
			debit: number;
			credit: number;
			eventType: "PURCHASE" | "PAYMENT";
			settlementId: string;
			orderNumber: string | null;
			poNumber: string | null;
			status: string;
			reconciliationStatus: string;
			referenceNo: string | null;
		};

		const rawEntries: RawEntry[] = [];
		for (const row of rows) {
			const poNumber = row.purchaseOrder?.poNumber ?? null;
			const orderNumber = row.order?.orderNumber ?? null;
			rawEntries.push({
				date: row.dueAt ?? row.createdAt,
				description: `Purchase${poNumber ? ` (${poNumber})` : ""}`,
				debit: row.amount,
				credit: 0,
				eventType: "PURCHASE",
				settlementId: row.id,
				orderNumber,
				poNumber,
				status: row.status,
				reconciliationStatus: row.reconciliationStatus,
				referenceNo: row.referenceNo ?? null,
			});

			const hasPaymentEvent = row.status === "PAID" || row.status === "PARTIAL";
			if (hasPaymentEvent) {
				rawEntries.push({
					date: row.paidAt ?? row.updatedAt,
					description:
						row.financierDisbursementId !== null
							? `Payment from Financier${poNumber ? ` (${poNumber})` : ""}`
							: `Payment to Supplier${poNumber ? ` (${poNumber})` : ""}`,
					debit: 0,
					credit: resolveCreditAmount({
						amount: row.amount,
						status: row.status,
						metadata: row.metadata,
					}),
					eventType: "PAYMENT",
					settlementId: row.id,
					orderNumber,
					poNumber,
					status: row.status,
					reconciliationStatus: row.reconciliationStatus,
					referenceNo: row.referenceNo ?? null,
				});
			}
		}

		rawEntries.sort((a, b) => a.date.getTime() - b.date.getTime());
		let runningBalance = 0;
		const entries = rawEntries.map((entry) => {
			runningBalance += entry.debit - entry.credit;
			return {
				date: entry.date,
				description: entry.description,
				debit: entry.debit,
				credit: entry.credit,
				balance: runningBalance,
				eventType: entry.eventType,
				settlementId: entry.settlementId,
				orderNumber: entry.orderNumber,
				poNumber: entry.poNumber,
				status: entry.status,
				reconciliationStatus: entry.reconciliationStatus,
				referenceNo: entry.referenceNo,
			};
		});

		const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
		const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);

		res.status(200).json(
			buildSuccessResponse(
				"Admin to Supplier SOA retrieved",
				{
					supplierId,
					view: "ADMIN_TO_SUPPLIER",
					summary: {
						totalEntries: entries.length,
						totalDebit,
						totalCredit,
						outstandingBalance: totalDebit - totalCredit,
					},
					entries,
				},
				200,
			),
		);
	};

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

	return { getAdminToSupplierSoa, create, getAll, getById, update, remove, reconcile };
};

