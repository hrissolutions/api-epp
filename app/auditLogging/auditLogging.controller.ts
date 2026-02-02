import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
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
import { CreateAuditLoggingSchema, UpdateAuditLoggingSchema } from "../../zod/auditLogging.zod";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { isValidObjectId } from "mongoose";

const logger = getLogger();
const auditLogger = logger.child({ module: "auditLogging" });

export const controller = (prisma: PrismaClient) => {
	// Typically audit logs are created by backend utilities, but we expose create for flexibility.
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = CreateAuditLoggingSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			auditLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const data = validation.data as any;

			// Ensure timestamp is set if not provided
			if (!data.timestamp) {
				data.timestamp = new Date();
			}

			const logEntry = await prisma.auditLogging.create({
				data: {
					...data,
					organizationId: (req as any).organizationId || data.organizationId,
				} as any,
			});
			auditLogger.info(`Audit log created: ${logEntry.id}`);

			try {
				await invalidateCache.byPattern("cache:auditLogging:list:*");
				auditLogger.info("AuditLogging list cache invalidated after creation");
			} catch (cacheError) {
				auditLogger.warn(
					"Failed to invalidate cache after auditLogging creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				"Audit log created successfully",
				logEntry,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			auditLogger.error(`Failed to create audit log: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, auditLogger);

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

		auditLogger.info(
			`Getting audit logs, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.AuditLoggingWhereInput = {
				isDeleted: false,
			};

			const searchFields = ["type", "severity", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("AuditLogging", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("AuditLogging", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [logs, total] = await Promise.all([
				document ? prisma.auditLogging.findMany(findManyQuery) : [],
				count ? prisma.auditLogging.count({ where: whereClause }) : 0,
			]);

			auditLogger.info(`Retrieved ${logs.length} audit logs`);

			const processedData =
				groupBy && document ? groupDataByField(logs, groupBy as string) : logs;

			const responseData: Record<string, any> = {
				...(document && { auditLogs: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse("Audit logs retrieved successfully", responseData, 200),
			);
		} catch (error) {
			auditLogger.error(`Failed to get audit logs: ${error}`);
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
				auditLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (!isValidObjectId(id)) {
				auditLogger.error(`Invalid ID format: ${id}`);
				const errorResponse = buildErrorResponse("Invalid ID format", 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				auditLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			auditLogger.info(`Getting audit log by ID: ${id}`);

			const fieldsStr = typeof fields === "string" ? fields : undefined;
			const cacheKey = `cache:auditLogging:byId:${id}:${fieldsStr || "full"}`;
			let logEntry = null;

			try {
				if (redisClient.isClientConnected()) {
					logEntry = await redisClient.getJSON(cacheKey);
					if (logEntry) {
						auditLogger.info(`Audit log ${id} retrieved from cache`);
					}
				}
			} catch (cacheError) {
				auditLogger.warn(`Redis cache retrieval failed for audit log ${id}:`, cacheError);
			}

			if (!logEntry) {
				const query: Prisma.AuditLoggingFindFirstArgs = { where: { id } };

				query.select = getNestedFields(fieldsStr);

				logEntry = await prisma.auditLogging.findFirst(query);

				if (logEntry && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, logEntry, 3600);
						auditLogger.info(`Audit log ${id} stored in cache`);
					} catch (cacheError) {
						auditLogger.warn(`Failed to store audit log ${id} in cache:`, cacheError);
					}
				}
			}

			if (!logEntry) {
				auditLogger.error(`Audit log not found: ${id}`);
				const errorResponse = buildErrorResponse("Audit log not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			auditLogger.info(`Audit log retrieved: ${(logEntry as any).id}`);
			const successResponse = buildSuccessResponse(
				"Audit log retrieved successfully",
				logEntry,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			auditLogger.error(`Error getting audit log: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// Only allow updating archive flags / isDeleted, not core log content
	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;

		try {
			if (!rawId) {
				auditLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (!isValidObjectId(id)) {
				auditLogger.error(`Invalid ID format: ${id}`);
				const errorResponse = buildErrorResponse("Invalid ID format", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateAuditLoggingSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				auditLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			auditLogger.info(`Updating audit log: ${id}`);

			const existingLog = await prisma.auditLogging.findFirst({
				where: { id },
			});

			if (!existingLog) {
				auditLogger.error(`Audit log not found: ${id}`);
				const errorResponse = buildErrorResponse("Audit log not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedLog = await prisma.auditLogging.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:auditLogging:byId:${id}:*`);
				await invalidateCache.byPattern("cache:auditLogging:list:*");
				auditLogger.info(`Cache invalidated after audit log ${id} update`);
			} catch (cacheError) {
				auditLogger.warn("Failed to invalidate cache after audit log update:", cacheError);
			}

			auditLogger.info(`Audit log updated: ${updatedLog.id}`);
			const successResponse = buildSuccessResponse(
				"Audit log updated successfully",
				updatedLog,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			auditLogger.error(`Error updating audit log: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// Soft-delete audit log
	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;

		try {
			if (!rawId) {
				auditLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (!isValidObjectId(id)) {
				auditLogger.error(`Invalid ID format: ${id}`);
				const errorResponse = buildErrorResponse("Invalid ID format", 400);
				res.status(400).json(errorResponse);
				return;
			}

			auditLogger.info(`Deleting audit log: ${id}`);

			const existingLog = await prisma.auditLogging.findFirst({
				where: { id },
			});

			if (!existingLog) {
				auditLogger.error(`Audit log not found: ${id}`);
				const errorResponse = buildErrorResponse("Audit log not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.auditLogging.update({
				where: { id },
				data: { isDeleted: true },
			});

			try {
				await invalidateCache.byPattern(`cache:auditLogging:byId:${id}:*`);
				await invalidateCache.byPattern("cache:auditLogging:list:*");
				auditLogger.info(`Cache invalidated after audit log ${id} deletion`);
			} catch (cacheError) {
				auditLogger.warn(
					"Failed to invalidate cache after audit log deletion:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse("Audit log deleted successfully", {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			auditLogger.error(`Failed to delete audit log: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
