import { NextFunction, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { PrismaClient } from "../../generated/prisma";
import {
	CreateAdminFinancierSettlementSchema,
	CreateFinancierDisbursementSchema,
	ReconcileFinancierDisbursementSchema,
	UpdateFinancierDisbursementSchema,
	UploadReceiptSchema,
} from "../../zod/financierDisbursement.zod";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { buildSuccessResponse } from "../../helper/success-handler";
import { uploadReceiptToCloudinary } from "../../helper/cloudinaryUpload";

export const controller = (prisma: PrismaClient) => {
	type SoaView = "ADMIN_TO_FINANCIER" | "FINANCIER";
	const DEFAULT_ADMIN_REMITTANCE_TERM_DAYS = 30;

	const addDays = (base: Date, days: number): Date => {
		const safeDays = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
		const next = new Date(base);
		next.setDate(next.getDate() + safeDays);
		return next;
	};

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

	const resolveCreditAmount = (row: {
		amount: number;
		reconciliationStatus: string;
		metadata: unknown;
	}): number => {
		const metadataAmount = parseAmountFromMetadata(row.metadata);
		if (row.reconciliationStatus === "PARTIAL" && metadataAmount !== null) {
			return Math.min(metadataAmount, row.amount);
		}
		return row.amount;
	};

	const buildSoa = async (
		view: SoaView,
		filters?: { financierConfigId?: string; organizationId?: string },
	) => {
		const where: Record<string, unknown> = {};
		if (filters?.financierConfigId) {
			where.financierConfigId = filters.financierConfigId;
		}
		if (filters?.organizationId) {
			where.organizationId = filters.organizationId;
		}

		const rows = await (prisma as any).financierDisbursement.findMany({
			where,
			orderBy: { createdAt: "asc" },
			include: {
				order: {
					select: {
						orderNumber: true,
					},
				},
				adminSettlements: {
					orderBy: { createdAt: "asc" },
				},
			},
		});

		type RawEntry = {
			date: Date;
			description: string;
			debit: number;
			credit: number;
			eventType: "LOAN" | "PAYMENT";
			disbursementId: string;
			remittanceId: string | null;
			orderNumber: string | null;
			status: string;
			reconciliationStatus: string;
			referenceNo: string | null;
			receiptType: string | null;
			receiptNumber: string | null;
			receiptAttachmentUrl: string | null;
		};

		const rawEntries: RawEntry[] = [];
		for (const row of rows) {
			const orderNumber = row.order?.orderNumber ?? null;
			const loanDate = row.disbursedAt ?? row.createdAt;
			const disbursementReceiptType = row.receiptType ?? null;
			const disbursementReceiptNumber = row.receiptNumber ?? null;
			const disbursementReceiptUrl = row.receiptAttachmentUrl ?? null;

			// Admin view: loan received = debit (balance increases). Financier view: loan given = credit (balance goes negative).
			const loanDebit = view === "FINANCIER" ? 0 : row.amount;
			const loanCredit = view === "FINANCIER" ? row.amount : 0;

			rawEntries.push({
				date: loanDate,
				description:
					view === "FINANCIER"
						? `Loan to Admin${orderNumber ? ` (${orderNumber})` : ""}`
						: `Loan from Financier${orderNumber ? ` (${orderNumber})` : ""}`,
				debit: loanDebit,
				credit: loanCredit,
				eventType: "LOAN",
				disbursementId: row.id,
				remittanceId: null,
				orderNumber,
				status: row.status,
				reconciliationStatus: row.reconciliationStatus,
				referenceNo: row.referenceNo ?? null,
				receiptType: disbursementReceiptType,
				receiptNumber: disbursementReceiptNumber,
				receiptAttachmentUrl: disbursementReceiptUrl,
			});

			const remittances = Array.isArray(row.adminSettlements) ? row.adminSettlements : [];
			for (const remittance of remittances) {
				const remittanceReceiptType = remittance.receiptType ?? null;
				const remittanceReceiptNumber = remittance.receiptNumber ?? null;
				const remittanceReceiptUrl = remittance.receiptAttachmentUrl ?? null;
				// Admin view: payment to financier = credit (balance decreases). Financier view: payment received = debit (balance less negative).
				const payDebit = view === "FINANCIER" ? remittance.amount : 0;
				const payCredit = view === "FINANCIER" ? 0 : remittance.amount;
				rawEntries.push({
					date: remittance.remittedAt ?? remittance.createdAt,
					description:
						view === "FINANCIER"
							? `Payment Received from Admin${orderNumber ? ` (${orderNumber})` : ""}`
							: `Payment to Financier${orderNumber ? ` (${orderNumber})` : ""}`,
					debit: payDebit,
					credit: payCredit,
					eventType: "PAYMENT",
					disbursementId: row.id,
					remittanceId: remittance.id,
					orderNumber,
					status: row.status,
					reconciliationStatus: row.reconciliationStatus,
					referenceNo: remittance.referenceNo ?? row.referenceNo ?? null,
					receiptType: remittanceReceiptType,
					receiptNumber: remittanceReceiptNumber,
					receiptAttachmentUrl: remittanceReceiptUrl,
				});
			}

			// Backward compatibility for older reconciled records without immutable remittance rows.
			const hasLegacyPaymentEvent =
				remittances.length === 0 &&
				(row.reconciliationStatus === "MATCHED" ||
					row.reconciliationStatus === "PARTIAL" ||
					row.reconciliationStatus === "SETTLED");
			if (hasLegacyPaymentEvent) {
				const legacyCreditAmount = resolveCreditAmount({
					amount: row.amount,
					reconciliationStatus: row.reconciliationStatus,
					metadata: row.metadata,
				});
				rawEntries.push({
					date: row.reconciledAt ?? row.updatedAt,
					description:
						view === "FINANCIER"
							? `Payment Received from Admin${orderNumber ? ` (${orderNumber})` : ""}`
							: `Payment to Financier${orderNumber ? ` (${orderNumber})` : ""}`,
					debit: view === "FINANCIER" ? legacyCreditAmount : 0,
					credit: view === "FINANCIER" ? 0 : legacyCreditAmount,
					eventType: "PAYMENT",
					disbursementId: row.id,
					remittanceId: null,
					orderNumber,
					status: row.status,
					reconciliationStatus: row.reconciliationStatus,
					referenceNo: row.referenceNo ?? null,
					receiptType: disbursementReceiptType,
					receiptNumber: disbursementReceiptNumber,
					receiptAttachmentUrl: disbursementReceiptUrl,
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
				debitLabel: "Amount in",
				credit: entry.credit,
				creditLabel: "Amount out",
				balance: runningBalance,
				eventType: entry.eventType,
				disbursementId: entry.disbursementId,
				remittanceId: entry.remittanceId,
				orderNumber: entry.orderNumber,
				status: entry.status,
				reconciliationStatus: entry.reconciliationStatus,
				referenceNo: entry.referenceNo,
				receiptType: entry.receiptType,
				receiptNumber: entry.receiptNumber,
				receiptAttachmentUrl: entry.receiptAttachmentUrl,
			};
		});

		const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
		const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);

		return {
			financierConfigId: filters?.financierConfigId ?? null,
			view,
			summary: {
				totalEntries: entries.length,
				totalDebit,
				totalCredit,
				outstandingBalance: totalDebit - totalCredit,
				debitLabel: "Amount in",
				creditLabel: "Amount out",
			},
			entries,
		};
	};

	const getAdminToFinancierSoa = async (req: Request, res: Response, _next: NextFunction) => {
		const rawFinancierConfigId = req.params.financierConfigId;
		const financierConfigId = Array.isArray(rawFinancierConfigId)
			? rawFinancierConfigId[0]
			: rawFinancierConfigId;
		const organizationId = (req as any).organizationId as string | undefined;
		const soa = await buildSoa("ADMIN_TO_FINANCIER", {
			financierConfigId,
			organizationId,
		});
		res.status(200).json(
			buildSuccessResponse(
				financierConfigId
					? "Admin ledger for financier config retrieved"
					: "Admin ledger across financier configs retrieved",
				soa,
				200,
			),
		);
	};

	const getFinancierSoa = async (req: Request, res: Response, _next: NextFunction) => {
		const rawFinancierConfigId = req.params.financierConfigId;
		const financierConfigId = Array.isArray(rawFinancierConfigId)
			? rawFinancierConfigId[0]
			: rawFinancierConfigId;
		const organizationId = (req as any).organizationId as string | undefined;
		const soa = await buildSoa("FINANCIER", { financierConfigId, organizationId });
		res.status(200).json(buildSuccessResponse("Financier ledger retrieved", soa, 200));
	};

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
			const pointsUsed = row.order?.pointsUsed ?? 0;
			const totalPayable = row.financingAgreement?.totalPayable ?? row.amount;
			const netPrincipalBase = principalAmount - pointsUsed;
			const installmentIncome = Math.max(totalPayable - netPrincipalBase, 0);
			const disbursedPrincipal = row.amount;

			return {
				...row,
				breakdown: {
					totalPrice: row.order?.subtotal ?? principalAmount,
					totalAmount: row.amount,
					principalAmount,
					serviceFee,
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

	const createRemittance = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const disbursementId = Array.isArray(rawId) ? rawId[0] : rawId;
		// Support both JSON and multipart: coerce amount from form string if needed
		const body =
			req.body?.amount != null && typeof req.body.amount !== "number"
				? { ...req.body, amount: Number(req.body.amount) }
				: req.body;
		const parsed = CreateAdminFinancierSettlementSchema.safeParse(body);
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

		const existingDisbursement = await prisma.financierDisbursement.findFirst({
			where: { id: disbursementId },
		});
		if (!existingDisbursement) {
			res.status(404).json(buildErrorResponse("Financier disbursement not found", 404));
			return;
		}

		const financierConfig = await (prisma as any).financierConfig.findFirst({
			where: { id: existingDisbursement.financierConfigId },
			select: { adminRemittanceTermDays: true },
		});
		const remittanceTermDays =
			Number(
				financierConfig?.adminRemittanceTermDays ?? DEFAULT_ADMIN_REMITTANCE_TERM_DAYS,
			) || DEFAULT_ADMIN_REMITTANCE_TERM_DAYS;
		const defaultDueAt =
			parsed.data.dueAt ??
			existingDisbursement.expectedAt ??
			addDays(
				existingDisbursement.disbursedAt ?? existingDisbursement.createdAt,
				remittanceTermDays,
			);

		const createData = {
			...parsed.data,
			financierDisbursementId: disbursementId,
			financierConfigId: existingDisbursement.financierConfigId,
			dueAt: defaultDueAt,
			organizationId:
				(req as any).organizationId ??
				parsed.data.organizationId ??
				existingDisbursement.organizationId,
		};

		let record = await (prisma as any).adminFinancierSettlement.create({
			data: createData,
		});

		// Optional: if receipt file was uploaded (admin → financier confirmation), store it on this remittance
		const file = req.file;
		if (file) {
			const uploadResult = await uploadReceiptToCloudinary(file, {
				folder: "remittance-receipts",
			});
			if (uploadResult.success && uploadResult.secureUrl) {
				record = await (prisma as any).adminFinancierSettlement.update({
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

		const aggregate = await (prisma as any).adminFinancierSettlement.aggregate({
			where: { financierDisbursementId: disbursementId },
			_sum: { amount: true },
		});
		const totalRemitted = Number(aggregate?._sum?.amount ?? 0);
		const nextReconciliationStatus =
			totalRemitted >= existingDisbursement.amount ? "SETTLED" : "PARTIAL";

		const validReconciledBy = isValidObjectId(parsed.data.createdBy ?? "")
			? parsed.data.createdBy
			: isValidObjectId(existingDisbursement.reconciledBy ?? "")
				? existingDisbursement.reconciledBy
				: undefined;
		const disbursementStatusUpdate =
			existingDisbursement.status === "PENDING"
				? {
						status: "DISBURSED" as const,
						disbursedAt:
							existingDisbursement.disbursedAt ??
							parsed.data.remittedAt ??
							new Date(),
					}
				: {};

		await prisma.financierDisbursement.update({
			where: { id: disbursementId },
			data: {
				...disbursementStatusUpdate,
				reconciliationStatus: nextReconciliationStatus as any,
				reconciledAt: new Date(),
				...(validReconciledBy ? { reconciledBy: validReconciledBy } : {}),
			},
		});

		res.status(201).json(
			buildSuccessResponse(
				"Admin to financier remittance created",
				{
					remittance: record,
					summary: {
						disbursementId,
						disbursementAmount: existingDisbursement.amount,
						totalRemitted,
						outstanding: Math.max(existingDisbursement.amount - totalRemitted, 0),
						reconciliationStatus: nextReconciliationStatus,
					},
				},
				201,
			),
		);
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

	const getRemittances = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const disbursementId = Array.isArray(rawId) ? rawId[0] : rawId;

		const existingDisbursement = await prisma.financierDisbursement.findFirst({
			where: { id: disbursementId },
			select: {
				id: true,
				orderId: true,
				financierConfigId: true,
				amount: true,
			},
		});
		if (!existingDisbursement) {
			res.status(404).json(buildErrorResponse("Financier disbursement not found", 404));
			return;
		}

		const remittances = await (prisma as any).adminFinancierSettlement.findMany({
			where: { financierDisbursementId: disbursementId },
			orderBy: { createdAt: "asc" },
		});
		const totalRemitted = remittances.reduce(
			(sum: number, row: { amount: number }) => sum + Number(row.amount ?? 0),
			0,
		);

		res.status(200).json(
			buildSuccessResponse(
				"Admin to financier remittances retrieved",
				{
					disbursement: existingDisbursement,
					summary: {
						remittanceCount: remittances.length,
						totalRemitted,
						outstanding: Math.max(existingDisbursement.amount - totalRemitted, 0),
						isOverpaid: totalRemitted > existingDisbursement.amount,
					},
					remittances,
				},
				200,
			),
		);
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

	const uploadReceipt = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const file = req.file;
		if (!file) {
			res.status(400).json(
				buildErrorResponse("Receipt file is required. Use multipart field 'receipt'.", 400),
			);
			return;
		}
		const parsed = UploadReceiptSchema.safeParse({
			receiptType: req.body?.receiptType,
			receiptNumber: req.body?.receiptNumber ?? null,
		});
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
		const uploadResult = await uploadReceiptToCloudinary(file, {
			folder: "disbursement-receipts",
		});
		if (!uploadResult.success || !uploadResult.secureUrl) {
			res.status(500).json(
				buildErrorResponse(uploadResult.error || "Failed to upload receipt file", 500),
			);
			return;
		}
		const updated = await prisma.financierDisbursement.update({
			where: { id },
			data: {
				receiptType: parsed.data.receiptType,
				receiptNumber: parsed.data.receiptNumber ?? null,
				receiptAttachmentUrl: uploadResult.secureUrl,
			},
		});
		res.status(200).json(
			buildSuccessResponse("Receipt uploaded and disbursement updated", updated, 200),
		);
	};

	const uploadRemittanceReceipt = async (req: Request, res: Response, _next: NextFunction) => {
		const rawRemittanceId = req.params.remittanceId;
		const remittanceId = Array.isArray(rawRemittanceId) ? rawRemittanceId[0] : rawRemittanceId;
		const file = req.file;
		if (!file) {
			res.status(400).json(
				buildErrorResponse("Receipt file is required. Use multipart field 'receipt'.", 400),
			);
			return;
		}
		const parsed = UploadReceiptSchema.safeParse({
			receiptType: req.body?.receiptType,
			receiptNumber: req.body?.receiptNumber ?? null,
		});
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
		const existing = await (prisma as any).adminFinancierSettlement.findFirst({
			where: { id: remittanceId },
		});
		if (!existing) {
			res.status(404).json(buildErrorResponse("Remittance not found", 404));
			return;
		}
		const uploadResult = await uploadReceiptToCloudinary(file, {
			folder: "remittance-receipts",
		});
		if (!uploadResult.success || !uploadResult.secureUrl) {
			res.status(500).json(
				buildErrorResponse(uploadResult.error || "Failed to upload receipt file", 500),
			);
			return;
		}
		const updated = await (prisma as any).adminFinancierSettlement.update({
			where: { id: remittanceId },
			data: {
				receiptType: parsed.data.receiptType,
				receiptNumber: parsed.data.receiptNumber ?? null,
				receiptAttachmentUrl: uploadResult.secureUrl,
			},
		});
		res.status(200).json(
			buildSuccessResponse("Receipt uploaded and remittance updated", updated, 200),
		);
	};

	return {
		getLedger,
		getAdminToFinancierSoa,
		getFinancierSoa,
		create,
		createRemittance,
		getAll,
		getById,
		getRemittances,
		update,
		remove,
		reconcile,
		uploadReceipt,
		uploadRemittanceReceipt,
	};
};
