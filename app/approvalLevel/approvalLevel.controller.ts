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
import { CreateApprovalLevelSchema, UpdateApprovalLevelSchema } from "../../zod/approvalLevel.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const approvalLevelLogger = logger.child({ module: "approvalLevel" });

// Helper function to convert string numbers to actual numbers for form data
const convertStringNumbers = (obj: any): any => {
	if (obj === null || obj === undefined) {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(convertStringNumbers);
	}

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
			if (!isNaN(num)) {
				return num;
			}
		}
		return obj;
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
			approvalLevelLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			requestData = convertStringNumbers(requestData);
			approvalLevelLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateApprovalLevelSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			approvalLevelLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const approvalLevel = await prisma.approvalLevel.create({
				data: {
					...validation.data,
					organizationId: (req as any).organizationId || validation.data.organizationId,
				} as any,
			});
			approvalLevelLogger.info(`ApprovalLevel created successfully: ${approvalLevel.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "CREATE_APPROVAL_LEVEL",
				description: `Approval level created: ${approvalLevel.role}`,
				page: {
					url: req.originalUrl,
					title: "Approval Level Creation",
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: "APPROVAL_LEVEL",
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: "APPROVAL_LEVEL",
				entityId: approvalLevel.id,
				changesBefore: null,
				changesAfter: approvalLevel,
				description: `Approval level created: ${approvalLevel.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:approvalLevel:list:*");
				await invalidateCache.byPattern("cache:workflowApprovalLevel:list:*");
				approvalLevelLogger.info("ApprovalLevel cache invalidated after creation");
			} catch (cacheError) {
				approvalLevelLogger.warn(
					"Failed to invalidate cache after approvalLevel creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				"Approval level created successfully",
				{ approvalLevel },
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			approvalLevelLogger.error(`Failed to create approval level: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, approvalLevelLogger);

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

		approvalLevelLogger.info(
			`Getting approval levels, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.ApprovalLevelWhereInput = {};

			const searchFields = ["role", "description"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"ApprovalLevel",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("ApprovalLevel", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [approvalLevels, total] = await Promise.all([
				document ? prisma.approvalLevel.findMany(findManyQuery) : [],
				count ? prisma.approvalLevel.count({ where: whereClause }) : 0,
			]);

			approvalLevelLogger.info(`Retrieved ${approvalLevels.length} approval levels`);
			const processedData =
				groupBy && document
					? groupDataByField(approvalLevels, groupBy as string)
					: approvalLevels;

			const responseData: Record<string, any> = {
				...(document && { approvalLevels: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse("Approval levels retrieved successfully", responseData, 200),
			);
		} catch (error) {
			approvalLevelLogger.error(`Failed to get approval levels: ${error}`);
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
				approvalLevelLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				approvalLevelLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			approvalLevelLogger.info(`Getting approval level by ID: ${id}`);

			const cacheKey = `cache:approvalLevel:byId:${id}:${fields || "full"}`;
			let approvalLevel = null;

			try {
				if (redisClient.isClientConnected()) {
					approvalLevel = await redisClient.getJSON(cacheKey);
					if (approvalLevel) {
						approvalLevelLogger.info(`ApprovalLevel ${id} retrieved from cache`);
					}
				}
			} catch (cacheError) {
				approvalLevelLogger.warn(
					`Redis cache retrieval failed for approvalLevel ${id}:`,
					cacheError,
				);
			}

			if (!approvalLevel) {
				const query: Prisma.ApprovalLevelFindFirstArgs = { where: { id },
				};

				query.select = getNestedFields(fields);

				approvalLevel = await prisma.approvalLevel.findFirst(query);

				if (approvalLevel && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, approvalLevel, 3600);
						approvalLevelLogger.info(`ApprovalLevel ${id} stored in cache`);
					} catch (cacheError) {
						approvalLevelLogger.warn(
							`Failed to store approvalLevel ${id} in cache:`,
							cacheError,
						);
					}
				}
			}

			if (!approvalLevel) {
				approvalLevelLogger.error(`Approval level not found: ${id}`);
				const errorResponse = buildErrorResponse("Approval level not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			approvalLevelLogger.info(`Approval level retrieved: ${(approvalLevel as any).id}`);
			const successResponse = buildSuccessResponse(
				"Approval level retrieved successfully",
				approvalLevel,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalLevelLogger.error(`Error getting approval level: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;

		try {
			if (!rawId) {
				approvalLevelLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
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

			const validationResult = UpdateApprovalLevelSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				approvalLevelLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				approvalLevelLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			approvalLevelLogger.info(`Updating approval level: ${id}`);

			const existingApprovalLevel = await prisma.approvalLevel.findFirst({
				where: { id },
			});

			if (!existingApprovalLevel) {
				approvalLevelLogger.error(`Approval level not found: ${id}`);
				const errorResponse = buildErrorResponse("Approval level not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedApprovalLevel = await prisma.approvalLevel.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:approvalLevel:byId:${id}:*`);
				await invalidateCache.byPattern("cache:approvalLevel:list:*");
				await invalidateCache.byPattern("cache:workflowApprovalLevel:list:*");
				approvalLevelLogger.info(`Cache invalidated after approvalLevel ${id} update`);
			} catch (cacheError) {
				approvalLevelLogger.warn(
					"Failed to invalidate cache after approvalLevel update:",
					cacheError,
				);
			}

			approvalLevelLogger.info(`Approval level updated: ${updatedApprovalLevel.id}`);
			const successResponse = buildSuccessResponse(
				"Approval level updated successfully",
				{ approvalLevel: updatedApprovalLevel },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalLevelLogger.error(`Error updating approval level: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;

		try {
			if (!rawId) {
				approvalLevelLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			approvalLevelLogger.info(`Deleting approval level: ${id}`);

			const existingApprovalLevel = await prisma.approvalLevel.findFirst({
				where: { id },
			});

			if (!existingApprovalLevel) {
				approvalLevelLogger.error(`Approval level not found: ${id}`);
				const errorResponse = buildErrorResponse("Approval level not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.approvalLevel.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:approvalLevel:byId:${id}:*`);
				await invalidateCache.byPattern("cache:approvalLevel:list:*");
				await invalidateCache.byPattern("cache:workflowApprovalLevel:list:*");
				approvalLevelLogger.info(`Cache invalidated after approvalLevel ${id} deletion`);
			} catch (cacheError) {
				approvalLevelLogger.warn(
					"Failed to invalidate cache after approvalLevel deletion:",
					cacheError,
				);
			}

			approvalLevelLogger.info(`Approval level deleted: ${id}`);
			const successResponse = buildSuccessResponse(
				"Approval level deleted successfully",
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalLevelLogger.error(`Failed to delete approval level: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
