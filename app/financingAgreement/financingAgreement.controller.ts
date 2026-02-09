import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	CreateFinancingAgreementSchema,
	UpdateFinancingAgreementSchema,
} from "../../zod/financingAgreement.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const financingAgreementLogger = logger.child({ module: "financingAgreement" });

const convertStringNumbers = (obj: any): any => {
	if (obj === null || obj === undefined) return obj;
	if (Array.isArray(obj)) return obj.map(convertStringNumbers);
	if (typeof obj === "object" && obj.constructor === Object) {
		const converted: any = {};
		for (const [key, value] of Object.entries(obj)) {
			converted[key] = convertStringNumbers(value);
		}
		return converted;
	}
	if (typeof obj === "string") {
		if (/^-?\d+\.?\d*$/.test(obj.trim()) && obj.trim() !== "") {
			const num = parseFloat(obj);
			if (!isNaN(num)) return num;
		}
	}
	return obj;
};

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			financingAgreementLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			requestData = convertStringNumbers(requestData);
		}

		const validation = CreateFinancingAgreementSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			financingAgreementLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const financingAgreement = await prisma.financingAgreement.create({
				data: {
					...validation.data,
					organizationId: (req as any).organizationId || validation.data.organizationId,
				} as any,
			});
			financingAgreementLogger.info(
				`FinancingAgreement created successfully: ${financingAgreement.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "CREATE_FINANCING_AGREEMENT",
				description: `Financing agreement created for order: ${financingAgreement.orderId}`,
				page: { url: req.originalUrl, title: "Financing Agreement Creation" },
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: "FINANCING_AGREEMENT",
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: "FINANCING_AGREEMENT",
				entityId: financingAgreement.id,
				changesBefore: null,
				changesAfter: financingAgreement,
				description: `Financing agreement created: ${financingAgreement.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:financingAgreement:list:*");
			} catch (cacheError) {
				financingAgreementLogger.warn(
					"Failed to invalidate cache after financingAgreement creation:",
					cacheError,
				);
			}

			res.status(201).json(
				buildSuccessResponse(
					"Financing agreement created successfully",
					{
						financingAgreement,
					},
					201,
				),
			);
		} catch (error) {
			financingAgreementLogger.error(`Failed to create financing agreement: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, financingAgreementLogger);
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

		financingAgreementLogger.info(
			`Getting financing agreements, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.FinancingAgreementWhereInput = {};
			const searchFields = ["orderId", "financierConfigId", "status"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"FinancingAgreement",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) whereClause.OR = searchConditions;
			}
			if (filter) {
				const filterConditions = buildFilterConditions("FinancingAgreement", filter);
				if (filterConditions.length > 0) whereClause.AND = filterConditions;
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [financingAgreements, total] = await Promise.all([
				document ? prisma.financingAgreement.findMany(findManyQuery) : [],
				count ? prisma.financingAgreement.count({ where: whereClause }) : 0,
			]);

			financingAgreementLogger.info(
				`Retrieved ${financingAgreements.length} financing agreements`,
			);
			const processedData =
				groupBy && document
					? groupDataByField(financingAgreements, groupBy as string)
					: financingAgreements;

			const responseData: Record<string, any> = {
				...(document && { financingAgreements: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					"Financing agreements retrieved successfully",
					responseData,
					200,
				),
			);
		} catch (error) {
			financingAgreementLogger.error(`Failed to get financing agreements: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;
		const { fields } = req.query;

		try {
			if (!rawId) {
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				res.status(400).json(
					buildErrorResponse(config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING, 400),
				);
				return;
			}

			financingAgreementLogger.info(`Getting financing agreement by ID: ${id}`);
			const cacheKey = `cache:financingAgreement:byId:${id}:${fields || "full"}`;
			let agreement: any = null;

			try {
				if (redisClient.isClientConnected()) {
					agreement = await redisClient.getJSON(cacheKey);
					if (agreement)
						financingAgreementLogger.info(
							`FinancingAgreement ${id} retrieved from cache`,
						);
				}
			} catch (cacheError) {
				financingAgreementLogger.warn(
					`Redis cache retrieval failed for financingAgreement ${id}:`,
					cacheError,
				);
			}

			if (!agreement) {
				const query: Prisma.FinancingAgreementFindFirstArgs = { where: { id } };
				(query as any).select = getNestedFields(fields);
				agreement = await prisma.financingAgreement.findFirst(query);

				if (agreement && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, agreement, 3600);
						financingAgreementLogger.info(`FinancingAgreement ${id} stored in cache`);
					} catch (cacheError) {
						financingAgreementLogger.warn(
							`Failed to store financingAgreement ${id} in cache:`,
							cacheError,
						);
					}
				}
			}

			if (!agreement) {
				financingAgreementLogger.error(`Financing agreement not found: ${id}`);
				res.status(404).json(buildErrorResponse("Financing agreement not found", 404));
				return;
			}

			res.status(200).json(
				buildSuccessResponse("Financing agreement retrieved successfully", agreement, 200),
			);
		} catch (error) {
			financingAgreementLogger.error(`Error getting financing agreement: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;

		try {
			if (!rawId) {
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			let requestData = req.body;
			const contentType = req.get("Content-Type") || "";
			if (
				contentType.includes("application/x-www-form-urlencoded") ||
				contentType.includes("multipart/form-data")
			) {
				requestData = transformFormDataToObject(req.body);
				requestData = convertStringNumbers(requestData);
			}

			const validationResult = UpdateFinancingAgreementSchema.safeParse(requestData);
			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
				return;
			}
			if (Object.keys(requestData).length === 0) {
				res.status(400).json(buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400));
				return;
			}

			const existing = await prisma.financingAgreement.findFirst({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Financing agreement not found", 404));
				return;
			}

			const updated = await prisma.financingAgreement.update({
				where: { id },
				data: validationResult.data as any,
			});

			try {
				await invalidateCache.byPattern(`cache:financingAgreement:byId:${id}:*`);
				await invalidateCache.byPattern("cache:financingAgreement:list:*");
			} catch (cacheError) {
				financingAgreementLogger.warn(
					"Failed to invalidate cache after financingAgreement update:",
					cacheError,
				);
			}

			res.status(200).json(
				buildSuccessResponse(
					"Financing agreement updated successfully",
					{
						financingAgreement: updated,
					},
					200,
				),
			);
		} catch (error) {
			financingAgreementLogger.error(`Error updating financing agreement: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;

		try {
			if (!rawId) {
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			financingAgreementLogger.info(`Deleting financing agreement: ${id}`);
			const existing = await prisma.financingAgreement.findFirst({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Financing agreement not found", 404));
				return;
			}

			await prisma.financingAgreement.delete({ where: { id } });

			try {
				await invalidateCache.byPattern(`cache:financingAgreement:byId:${id}:*`);
				await invalidateCache.byPattern("cache:financingAgreement:list:*");
			} catch (cacheError) {
				financingAgreementLogger.warn(
					"Failed to invalidate cache after financingAgreement deletion:",
					cacheError,
				);
			}

			res.status(200).json(
				buildSuccessResponse("Financing agreement deleted successfully", {}, 200),
			);
		} catch (error) {
			financingAgreementLogger.error(`Failed to delete financing agreement: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	return { create, getAll, getById, update, remove };
};
