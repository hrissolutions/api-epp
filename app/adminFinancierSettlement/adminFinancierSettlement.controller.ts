import { NextFunction, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
} from "../../helper/query-builder";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler";
import { groupDataByField } from "../../helper/dataGrouping";
import {
	CreateAdminFinancierSettlementStandaloneSchema,
	UpdateAdminFinancierSettlementSchema,
} from "../../zod/financierDisbursement.zod";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { uploadReceiptToCloudinary } from "../../helper/cloudinaryUpload";

const logger = getLogger();
const settlementLogger = logger.child({ module: "adminFinancierSettlement" });

const DEFAULT_INCLUDE = {
	financierDisbursement: {
		select: {
			id: true,
			orderId: true,
			amount: true,
			order: { select: { orderNumber: true } },
		},
	},
} as const;

export const controller = (prisma: PrismaClient) => {
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, settlementLogger);
		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}
		const {
			page,
			limit,
			order,
			fields,
			sort,
			skip,
			query,
			document,
			pagination,
			count,
			filter,
			groupBy,
		} = validationResult.validatedParams!;
		settlementLogger.info(
			`Getting admin financier settlements, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);
		try {
			const whereClause: Prisma.AdminFinancierSettlementWhereInput = {};
			const searchFields = ["referenceNo", "notes", "receiptNumber"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"AdminFinancierSettlement",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) whereClause.OR = searchConditions;
			}
			if (filter) {
				const filterConditions = buildFilterConditions("AdminFinancierSettlement", filter);
				if (filterConditions.length > 0) whereClause.AND = filterConditions;
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);
			const findManyOpts = { ...findManyQuery };
			if (!findManyOpts.select) {
				(findManyOpts as any).include = DEFAULT_INCLUDE;
			}
			const [rows, total] = await Promise.all([
				document ? prisma.adminFinancierSettlement.findMany(findManyOpts as any) : [],
				count ? prisma.adminFinancierSettlement.count({ where: whereClause }) : 0,
			]);
			settlementLogger.info(`Retrieved ${Array.isArray(rows) ? rows.length : 0} settlements`);
			const processedData =
				groupBy && document ? groupDataByField(rows as any[], groupBy as string) : rows;
			const responseData: Record<string, unknown> = {
				...(document && { adminFinancierSettlements: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};
			res.status(200).json(
				buildSuccessResponse("Admin financier settlements retrieved", responseData, 200),
			);
		} catch (error) {
			settlementLogger.error(`Get all admin financier settlements failed: ${error}`);
			res.status(500).json(
				buildErrorResponse("Failed to retrieve admin financier settlements", 500),
			);
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const row = await prisma.adminFinancierSettlement.findFirst({
			where: { id },
			include: {
				financierDisbursement: {
					select: {
						id: true,
						orderId: true,
						amount: true,
						order: { select: { orderNumber: true } },
					},
				},
			},
		});
		if (!row) {
			res.status(404).json(buildErrorResponse("Admin financier settlement not found", 404));
			return;
		}
		res.status(200).json(
			buildSuccessResponse("Admin financier settlement retrieved", row, 200),
		);
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const body =
			req.body?.amount != null && typeof req.body.amount !== "number"
				? { ...req.body, amount: Number(req.body.amount) }
				: req.body;
		const parsed = CreateAdminFinancierSettlementStandaloneSchema.safeParse(body);
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
		const disbursement = await prisma.financierDisbursement.findFirst({
			where: { id: parsed.data.financierDisbursementId },
		});
		if (!disbursement) {
			res.status(404).json(buildErrorResponse("Financier disbursement not found", 404));
			return;
		}
		const createData = {
			...parsed.data,
			organizationId: (req as any).organizationId ?? parsed.data.organizationId ?? null,
		};
		let record = await prisma.adminFinancierSettlement.create({
			data: createData as any,
		});
		// Optional: upload receipt file to Cloudinary (multipart field "receipt") and set receiptAttachmentUrl
		const file = req.file;
		if (file) {
			const uploadResult = await uploadReceiptToCloudinary(file, {
				folder: "remittance-receipts",
			});
			if (uploadResult.success && uploadResult.secureUrl) {
				record = await prisma.adminFinancierSettlement.update({
					where: { id: record.id },
					data: {
						receiptAttachmentUrl: uploadResult.secureUrl,
						...(parsed.data.receiptType != null && { receiptType: parsed.data.receiptType }),
						...(parsed.data.receiptNumber != null && {
							receiptNumber: parsed.data.receiptNumber,
						}),
					},
				});
			}
		}

		// Same as "remit" under financier-disbursement: update parent disbursement reconciliation
		const aggregate = await prisma.adminFinancierSettlement.aggregate({
			where: { financierDisbursementId: disbursement.id },
			_sum: { amount: true },
		});
		const totalRemitted = Number(aggregate?._sum?.amount ?? 0);
		const nextReconciliationStatus =
			totalRemitted >= disbursement.amount ? "SETTLED" : "PARTIAL";
		const validReconciledBy = isValidObjectId(parsed.data.createdBy ?? "")
			? parsed.data.createdBy
			: isValidObjectId(disbursement.reconciledBy ?? "")
				? disbursement.reconciledBy
				: undefined;
		const disbursementStatusUpdate =
			disbursement.status === "PENDING"
				? {
						status: "DISBURSED" as const,
						disbursedAt:
							disbursement.disbursedAt ??
							parsed.data.remittedAt ??
							new Date(),
					}
				: {};
		await prisma.financierDisbursement.update({
			where: { id: disbursement.id },
			data: {
				...disbursementStatusUpdate,
				reconciliationStatus: nextReconciliationStatus as any,
				reconciledAt: new Date(),
				...(validReconciledBy ? { reconciledBy: validReconciledBy } : {}),
			},
		});

		res.status(201).json(
			buildSuccessResponse("Admin financier settlement created", {
				adminFinancierSettlement: record,
				summary: {
					disbursementId: disbursement.id,
					disbursementAmount: disbursement.amount,
					totalRemitted,
					outstanding: Math.max(disbursement.amount - totalRemitted, 0),
					reconciliationStatus: nextReconciliationStatus,
				},
			}, 201),
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
		const parsed = UpdateAdminFinancierSettlementSchema.safeParse(body);
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
		const existing = await prisma.adminFinancierSettlement.findFirst({ where: { id } });
		if (!existing) {
			res.status(404).json(buildErrorResponse("Admin financier settlement not found", 404));
			return;
		}
		let updateData = { ...parsed.data } as any;
		// If multipart included a receipt file, upload to Cloudinary and set receiptAttachmentUrl
		const file = req.file;
		if (file) {
			const uploadResult = await uploadReceiptToCloudinary(file, {
				folder: "remittance-receipts",
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
		const updated = await prisma.adminFinancierSettlement.update({
			where: { id },
			data: updateData,
		});
		res.status(200).json(
			buildSuccessResponse("Admin financier settlement updated", updated, 200),
		);
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const rawId = req.params.id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		const existing = await prisma.adminFinancierSettlement.findFirst({ where: { id } });
		if (!existing) {
			res.status(404).json(buildErrorResponse("Admin financier settlement not found", 404));
			return;
		}
		await prisma.adminFinancierSettlement.delete({ where: { id } });
		res.status(200).json(
			buildSuccessResponse("Admin financier settlement deleted", {}, 200),
		);
	};

	return {
		getAll,
		getById,
		create,
		update,
		remove,
	};
};
