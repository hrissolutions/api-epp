import { NextFunction, Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma";
import {
	CreateFinancierDisbursementSchema,
	ReconcileFinancierDisbursementSchema,
	UpdateFinancierDisbursementSchema,
} from "../../zod/financierDisbursement.zod";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { buildSuccessResponse } from "../../helper/success-handler";

export const controller = (prisma: PrismaClient) => {
	const getLedger = async (req: Request, res: Response, _next: NextFunction) => {
		const rawFinancierConfigId = req.params.financierConfigId;
		const financierConfigId = Array.isArray(rawFinancierConfigId)
			? rawFinancierConfigId[0]
			: rawFinancierConfigId;

		const rows = await prisma.financierDisbursement.findMany({
			where: { financierConfigId },
			orderBy: { createdAt: "asc" },
			include: {
				order: {
					select: {
						orderNumber: true,
						subtotal: true,
						discount: true,
						tax: true,
						pointsUsed: true,
						total: true,
					},
				},
				financingAgreement: {
					select: {
						principalAmount: true,
						totalPayable: true,
						interestRate: true,
						installmentCount: true,
						installmentAmount: true,
					},
				},
			},
		});

		const entries = rows.map((row) => {
			const principalAmount = row.financingAgreement?.principalAmount ?? row.amount;
			const serviceFee = Math.max(row.amount - principalAmount, 0);
			const tax = row.order?.tax ?? 0;
			const pointsUsed = row.order?.pointsUsed ?? 0;
			const totalPayable = row.financingAgreement?.totalPayable ?? row.amount;
			const taxableBase = principalAmount + tax - pointsUsed;
			const installmentIncome = Math.max(totalPayable - taxableBase, 0);
			const disbursedPrincipal = row.amount;

			return {
				...row,
				breakdown: {
					totalPrice: row.order?.subtotal ?? principalAmount,
					totalAmount: row.amount,
					principalAmount,
					serviceFee,
					tax,
					disbursedPrincipal,
					installmentIncome,
					installmentCount: row.financingAgreement?.installmentCount ?? null,
					installmentAmount: row.financingAgreement?.installmentAmount ?? null,
				},
			};
		});

		const totalAmount = entries.reduce((sum, row) => sum + row.amount, 0);
		const totalDisbursed = entries
			.filter((row) => row.status === "DISBURSED")
			.reduce((sum, row) => sum + row.amount, 0);
		const totalPending = entries
			.filter((row) => row.status === "PENDING")
			.reduce((sum, row) => sum + row.amount, 0);
		const totalFailedOrCancelled = entries
			.filter((row) => row.status === "FAILED" || row.status === "CANCELLED")
			.reduce((sum, row) => sum + row.amount, 0);
		const totalReconciled = entries
			.filter(
				(row) =>
					row.reconciliationStatus === "MATCHED" ||
					row.reconciliationStatus === "SETTLED",
			)
			.reduce((sum, row) => sum + row.amount, 0);
		const totalDisbursedPrincipal = entries.reduce(
			(sum, row) => sum + Number(row.breakdown?.disbursedPrincipal ?? 0),
			0,
		);
		const totalInstallmentIncome = entries.reduce(
			(sum, row) => sum + Number(row.breakdown?.installmentIncome ?? 0),
			0,
		);
		res.status(200).json(
			buildSuccessResponse(
				"Financier ledger retrieved",
				{
					financierConfigId,
					summary: {
						totalEntries: entries.length,
						totalAmount,
						totalDisbursed,
						totalPending,
						totalFailedOrCancelled,
						totalReconciled,
						outstanding: totalAmount - totalDisbursed,
						totalDisbursedPrincipal,
						totalInstallmentIncome,
					},
					entries,
				},
				200,
			),
		);
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const parsed = CreateFinancierDisbursementSchema.safeParse(req.body);
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
		const record = await prisma.financierDisbursement.create({
			data: {
				...parsed.data,
				organizationId: (req as any).organizationId ?? parsed.data.organizationId,
			} as any,
		});
		res.status(201).json(buildSuccessResponse("Financier disbursement created", record, 201));
	};

	const getAll = async (_req: Request, res: Response, _next: NextFunction) => {
		const rows = await prisma.financierDisbursement.findMany({
			orderBy: { createdAt: "desc" },
		});
		res.status(200).json(buildSuccessResponse("Financier disbursements retrieved", rows, 200));
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const row = await prisma.financierDisbursement.findFirst({ where: { id } });
		if (!row) {
			res.status(404).json(buildErrorResponse("Financier disbursement not found", 404));
			return;
		}
		res.status(200).json(buildSuccessResponse("Financier disbursement retrieved", row, 200));
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const parsed = UpdateFinancierDisbursementSchema.safeParse(req.body);
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
		const existing = await prisma.financierDisbursement.findFirst({ where: { id } });
		if (!existing) {
			res.status(404).json(buildErrorResponse("Financier disbursement not found", 404));
			return;
		}
		const updated = await prisma.financierDisbursement.update({
			where: { id },
			data: parsed.data as any,
		});
		res.status(200).json(buildSuccessResponse("Financier disbursement updated", updated, 200));
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const existing = await prisma.financierDisbursement.findFirst({ where: { id } });
		if (!existing) {
			res.status(404).json(buildErrorResponse("Financier disbursement not found", 404));
			return;
		}
		await prisma.financierDisbursement.delete({ where: { id } });
		res.status(200).json(buildSuccessResponse("Financier disbursement deleted", {}, 200));
	};

	const reconcile = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const parsed = ReconcileFinancierDisbursementSchema.safeParse(req.body);
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
		const existing = await prisma.financierDisbursement.findFirst({ where: { id } });
		if (!existing) {
			res.status(404).json(buildErrorResponse("Financier disbursement not found", 404));
			return;
		}
		const updated = await prisma.financierDisbursement.update({
			where: { id },
			data: {
				reconciliationStatus: parsed.data.status,
				reconciledAt: new Date(),
				reconciledBy: parsed.data.reconciledBy,
				notes: parsed.data.notes ?? existing.notes,
			},
		});
		res.status(200).json(
			buildSuccessResponse("Financier disbursement reconciled", updated, 200),
		);
	};

	return { getLedger, create, getAll, getById, update, remove, reconcile };
};
