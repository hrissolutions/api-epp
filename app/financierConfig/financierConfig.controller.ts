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
	CreateFinancierConfigSchema,
	UpdateFinancierConfigSchema,
} from "../../zod/financierConfig.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const financierConfigLogger = logger.child({ module: "financierConfig" });

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
			financierConfigLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			requestData = convertStringNumbers(requestData);
			if (typeof requestData.installmentRateConfig === "string") {
				try {
					requestData.installmentRateConfig = JSON.parse(
						requestData.installmentRateConfig,
					);
				} catch {
					// leave as-is, zod will validate
				}
			}
		}

		const validation = CreateFinancierConfigSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			financierConfigLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const data = validation.data as any;
			// New config: availableCredits = maxCreditLimit (full credit), usedCredits = 0
			const availableCredits = data.availableCredits ?? data.maxCreditLimit ?? 0;
			const financierConfig = await prisma.financierConfig.create({
				data: {
					...data,
					organizationId: (req as any).organizationId || data.organizationId,
					availableCredits,
					usedCredits: 0,
				} as any,
			});
			financierConfigLogger.info(
				`FinancierConfig created successfully: ${financierConfig.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "CREATE_FINANCIER_CONFIG",
				description: `Financier config created: ${financierConfig.name}`,
				page: { url: req.originalUrl, title: "Financier Config Creation" },
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: "FINANCIER_CONFIG",
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: "FINANCIER_CONFIG",
				entityId: financierConfig.id,
				changesBefore: null,
				changesAfter: financierConfig,
				description: `Financier config created: ${financierConfig.name}`,
			});

			try {
				await invalidateCache.byPattern("cache:financierConfig:list:*");
			} catch (cacheError) {
				financierConfigLogger.warn(
					"Failed to invalidate cache after financierConfig creation:",
					cacheError,
				);
			}

			res.status(201).json(
				buildSuccessResponse(
					"Financier config created successfully",
					{ financierConfig },
					201,
				),
			);
		} catch (error) {
			financierConfigLogger.error(`Failed to create financier config: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, financierConfigLogger);
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

		financierConfigLogger.info(
			`Getting financier configs, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.FinancierConfigWhereInput = {};
			const searchFields = ["name", "code", "userId"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"FinancierConfig",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) whereClause.OR = searchConditions;
			}
			if (filter) {
				const filterConditions = buildFilterConditions("FinancierConfig", filter);
				if (filterConditions.length > 0) whereClause.AND = filterConditions;
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [financierConfigs, total] = await Promise.all([
				document ? prisma.financierConfig.findMany(findManyQuery) : [],
				count ? prisma.financierConfig.count({ where: whereClause }) : 0,
			]);

			financierConfigLogger.info(`Retrieved ${financierConfigs.length} financier configs`);

			const processedData =
				groupBy && document && financierConfigs.length > 0
					? groupDataByField(financierConfigs, groupBy as string)
					: financierConfigs;

			const responseData: Record<string, any> = {
				...(document && { financierConfigs: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse("Financier configs retrieved successfully", responseData, 200),
			);
		} catch (error) {
			financierConfigLogger.error(`Failed to get financier configs: ${error}`);
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

			financierConfigLogger.info(`Getting financier config by ID: ${id}`);
			const cacheKey = `cache:financierConfig:byId:${id}:${fields || "full"}`;
			let financierConfig: any = null;

			try {
				if (redisClient.isClientConnected()) {
					financierConfig = await redisClient.getJSON(cacheKey);
					if (financierConfig)
						financierConfigLogger.info(`FinancierConfig ${id} retrieved from cache`);
				}
			} catch (cacheError) {
				financierConfigLogger.warn(
					`Redis cache retrieval failed for financierConfig ${id}:`,
					cacheError,
				);
			}

			if (!financierConfig) {
				const query: Prisma.FinancierConfigFindFirstArgs = { where: { id } };
				(query as any).select = getNestedFields(fields);
				financierConfig = await prisma.financierConfig.findFirst(query);

				if (financierConfig && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, financierConfig, 3600);
						financierConfigLogger.info(`FinancierConfig ${id} stored in cache`);
					} catch (cacheError) {
						financierConfigLogger.warn(
							`Failed to store financierConfig ${id} in cache:`,
							cacheError,
						);
					}
				}
			}

			if (!financierConfig) {
				financierConfigLogger.error(`Financier config not found: ${id}`);
				res.status(404).json(buildErrorResponse("Financier config not found", 404));
				return;
			}

			res.status(200).json(
				buildSuccessResponse(
					"Financier config retrieved successfully",
					financierConfig,
					200,
				),
			);
		} catch (error) {
			financierConfigLogger.error(`Error getting financier config: ${error}`);
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
				if (typeof requestData.installmentRateConfig === "string") {
					try {
						requestData.installmentRateConfig = JSON.parse(
							requestData.installmentRateConfig,
						);
					} catch {
						// leave as-is
					}
				}
			}

			const validationResult = UpdateFinancierConfigSchema.safeParse(requestData);
			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
				return;
			}
			if (Object.keys(requestData).length === 0) {
				res.status(400).json(buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400));
				return;
			}

			const existing = await prisma.financierConfig.findFirst({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Financier config not found", 404));
				return;
			}

			const updated = await prisma.financierConfig.update({
				where: { id },
				data: validationResult.data as any,
			});

			try {
				await invalidateCache.byPattern(`cache:financierConfig:byId:${id}:*`);
				await invalidateCache.byPattern("cache:financierConfig:list:*");
			} catch (cacheError) {
				financierConfigLogger.warn(
					"Failed to invalidate cache after financierConfig update:",
					cacheError,
				);
			}

			res.status(200).json(
				buildSuccessResponse(
					"Financier config updated successfully",
					{ financierConfig: updated },
					200,
				),
			);
		} catch (error) {
			financierConfigLogger.error(`Error updating financier config: ${error}`);
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

			financierConfigLogger.info(`Deleting financier config: ${id}`);
			const existing = await prisma.financierConfig.findFirst({ where: { id } });
			if (!existing) {
				res.status(404).json(buildErrorResponse("Financier config not found", 404));
				return;
			}

			await prisma.financierConfig.delete({ where: { id } });

			try {
				await invalidateCache.byPattern(`cache:financierConfig:byId:${id}:*`);
				await invalidateCache.byPattern("cache:financierConfig:list:*");
			} catch (cacheError) {
				financierConfigLogger.warn(
					"Failed to invalidate cache after financierConfig deletion:",
					cacheError,
				);
			}

			res.status(200).json(
				buildSuccessResponse("Financier config deleted successfully", {}, 200),
			);
		} catch (error) {
			financierConfigLogger.error(`Failed to delete financier config: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	return { create, getAll, getById, update, remove };
};
