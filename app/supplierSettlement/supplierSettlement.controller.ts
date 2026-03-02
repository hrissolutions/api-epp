import { NextFunction, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { PrismaClient } from "../../generated/prisma";
import {
	CreateRemittanceBySettlementIdSchema,
	CreateSupplierSettlementSchema,
	ReconcileSupplierSettlementSchema,
	UpdateSupplierSettlementSchema,
} from "../../zod/supplierSettlement.zod";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { buildSuccessResponse } from "../../helper/success-handler";
import { uploadReceiptToCloudinary } from "../../helper/cloudinaryUpload";

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

	type LedgerViewType = "ADMIN" | "SUPPLIER";

	const getAdminToSupplierSoa = async (req: Request, res: Response, _next: NextFunction) => {
		const rawSupplierId = req.params.supplierId;
		const supplierId = Array.isArray(rawSupplierId) ? rawSupplierId[0] : rawSupplierId;
		const viewParam = req.query.view as string | undefined;
		const view: LedgerViewType = viewParam === "supplier" ? "SUPPLIER" : "ADMIN";

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
			eventType: "PURCHASE" | "PAYMENT";
			settlementId: string;
			remittanceId: string | null;
			orderNumber: string | null;
			poNumber: string | null;
			status: string;
			reconciliationStatus: string;
			referenceNo: string | null;
			receiptType: string | null;
			receiptNumber: string | null;
			receiptAttachmentUrl: string | null;
		};

		const rawEntries: RawEntry[] = [];
		for (const row of rows) {
			const poNumber = row.purchaseOrder?.poNumber ?? null;
			const orderNumber = row.order?.orderNumber ?? null;
			const purchaseDesc =
				view === "SUPPLIER"
					? `Invoice from Admin${poNumber ? ` (${poNumber})` : ""}`
					: `Purchase${poNumber ? ` (${poNumber})` : ""}`;
			const paymentDesc =
				row.financierDisbursementId !== null
					? view === "SUPPLIER"
						? `Payment received${poNumber ? ` (${poNumber})` : ""}`
						: `Payment from Financier${poNumber ? ` (${poNumber})` : ""}`
					: view === "SUPPLIER"
						? `Payment received from Admin${poNumber ? ` (${poNumber})` : ""}`
						: `Payment to Supplier${poNumber ? ` (${poNumber})` : ""}`;

			// Admin view: purchase (we owe) = debit, balance positive. Supplier view: invoice (they're owed) = credit, balance negative.
			const purchaseDebit = view === "SUPPLIER" ? 0 : row.amount;
			const purchaseCredit = view === "SUPPLIER" ? row.amount : 0;

			rawEntries.push({
				date: row.dueAt ?? row.createdAt,
				description: purchaseDesc,
				debit: purchaseDebit,
				credit: purchaseCredit,
				eventType: "PURCHASE",
				settlementId: row.id,
				remittanceId: null,
				orderNumber,
				poNumber,
				status: row.status,
				reconciliationStatus: row.reconciliationStatus,
				referenceNo: row.referenceNo ?? null,
				receiptType: row.receiptType ?? null,
				receiptNumber: row.receiptNumber ?? null,
				receiptAttachmentUrl: row.receiptAttachmentUrl ?? null,
			});

			const adminSettlements = Array.isArray((row as any).adminSettlements)
				? (row as any).adminSettlements
				: [];
			if (adminSettlements.length > 0) {
				for (const rem of adminSettlements) {
					// Admin view: payment to supplier = credit. Supplier view: payment received = debit.
					const payDebit = view === "SUPPLIER" ? rem.amount : 0;
					const payCredit = view === "SUPPLIER" ? 0 : rem.amount;
					rawEntries.push({
						date: rem.remittedAt ?? rem.createdAt,
						description: paymentDesc,
						debit: payDebit,
						credit: payCredit,
						eventType: "PAYMENT",
						settlementId: row.id,
						remittanceId: rem.id,
						orderNumber,
						poNumber,
						status: row.status,
						reconciliationStatus: row.reconciliationStatus,
						referenceNo: rem.referenceNo ?? row.referenceNo ?? null,
						receiptType: rem.receiptType ?? null,
						receiptNumber: rem.receiptNumber ?? null,
						receiptAttachmentUrl: rem.receiptAttachmentUrl ?? null,
					});
				}
			} else {
				const hasPaymentEvent = row.status === "PAID" || row.status === "PARTIAL";
				if (hasPaymentEvent) {
					const legacyAmount = resolveCreditAmount({
						amount: row.amount,
						status: row.status,
						metadata: row.metadata,
					});
					rawEntries.push({
						date: row.paidAt ?? row.updatedAt,
						description: paymentDesc,
						debit: view === "SUPPLIER" ? legacyAmount : 0,
						credit: view === "SUPPLIER" ? 0 : legacyAmount,
						eventType: "PAYMENT",
						settlementId: row.id,
						remittanceId: null,
						orderNumber,
						poNumber,
						status: row.status,
						reconciliationStatus: row.reconciliationStatus,
						referenceNo: row.referenceNo ?? null,
						receiptType: row.receiptType ?? null,
						receiptNumber: row.receiptNumber ?? null,
						receiptAttachmentUrl: row.receiptAttachmentUrl ?? null,
					});
				}
			}
		}

		// Sort by settlement, then PURCHASE before PAYMENT, then date (so balance = debit then credit, never negative)
		const eventOrder = (e: string) => (e === "PURCHASE" ? 0 : 1);
		rawEntries.sort(
			(a, b) =>
				a.settlementId.localeCompare(b.settlementId) ||
				eventOrder(a.eventType) - eventOrder(b.eventType) ||
				a.date.getTime() - b.date.getTime(),
		);
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
				settlementId: entry.settlementId,
				remittanceId: entry.remittanceId,
				orderNumber: entry.orderNumber,
				poNumber: entry.poNumber,
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

		const message =
			view === "SUPPLIER"
				? "Supplier ledger (SOA) retrieved"
				: "Admin to Supplier SOA retrieved";

		res.status(200).json(
			buildSuccessResponse(
				message,
				{
					supplierId,
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
				},
				200,
			),
		);
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const parsed = CreateSupplierSettlementSchema.safeParse(req.body);
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
		const rawBody = req.body ?? {};
		const body =
			rawBody?.amount != null && typeof rawBody.amount !== "number"
				? { ...rawBody, amount: Number(rawBody.amount) }
				: rawBody;
		const parsed = UpdateSupplierSettlementSchema.safeParse(body);
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
		const existing = await prisma.supplierSettlement.findFirst({ where: { id } });
		if (!existing) {
			res.status(404).json(buildErrorResponse("Supplier settlement not found", 404));
			return;
		}
		let updateData = { ...parsed.data } as any;
		const file = req.file;
		if (file) {
			const uploadResult = await uploadReceiptToCloudinary(file, {
				folder: "supplier-settlement-receipts",
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
		const updated = await prisma.supplierSettlement.update({
			where: { id },
			data: updateData,
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

	const createRemittance = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const supplierSettlementId = Array.isArray(rawId) ? rawId[0] : rawId;
		const body =
			req.body?.amount != null && typeof req.body.amount !== "number"
				? { ...req.body, amount: Number(req.body.amount) }
				: req.body;
		const parsed = CreateRemittanceBySettlementIdSchema.safeParse(body);
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
			where: { id: supplierSettlementId },
		});
		if (!settlement) {
			res.status(404).json(buildErrorResponse("Supplier settlement not found", 404));
			return;
		}
		const createData: Record<string, unknown> = {
			...parsed.data,
			supplierSettlementId,
			supplierId: settlement.supplierId,
			organizationId: (req as any).organizationId ?? settlement.organizationId ?? null,
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
		const aggregate = await (prisma as any).adminSupplierSettlement.aggregate({
			where: { supplierSettlementId: settlement.id },
			_sum: { amount: true },
		});
		const totalRemitted = Number(aggregate?._sum?.amount ?? 0);
		const nextReconciliationStatus = totalRemitted >= settlement.amount ? "SETTLED" : "PARTIAL";
		const statusUpdate =
			settlement.status === "PENDING"
				? {
						status:
							totalRemitted >= settlement.amount
								? ("PAID" as const)
								: ("PARTIAL" as const),
						paidAt: parsed.data.remittedAt ?? new Date(),
					}
				: {};
		await prisma.supplierSettlement.update({
			where: { id: settlement.id },
			data: {
				...statusUpdate,
				reconciliationStatus: nextReconciliationStatus as any,
				reconciledAt: new Date(),
			},
		});
		res.status(201).json(
			buildSuccessResponse(
				"Admin to supplier remittance created",
				{
					remittance: record,
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

	const reconcile = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const parsed = ReconcileSupplierSettlementSchema.safeParse(req.body);
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

	return {
		getAdminToSupplierSoa,
		create,
		createRemittance,
		getAll,
		getById,
		update,
		remove,
		reconcile,
	};
};
