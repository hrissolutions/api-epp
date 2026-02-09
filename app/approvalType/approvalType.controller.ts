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
import { CreateApprovalTypeSchema, UpdateApprovalTypeSchema } from "../../zod/approvalType.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const approvalTypeLogger = logger.child({ module: "approvalType" });

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
			approvalTypeLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			requestData = convertStringNumbers(requestData);
			approvalTypeLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateApprovalTypeSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			approvalTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const approvalType = await prisma.approvalType.create({
				data: {
					...validation.data,
					organizationId: (req as any).organizationId || validation.data.organizationId,
				} as any,
			});
			approvalTypeLogger.info(`ApprovalType created successfully: ${approvalType.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "CREATE_APPROVAL_TYPE",
				description: `Approval type created: ${approvalType.role}`,
				page: {
					url: req.originalUrl,
					title: "Approval Type Creation",
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: "APPROVAL_TYPE",
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: "APPROVAL_TYPE",
				entityId: approvalType.id,
				changesBefore: null,
				changesAfter: approvalType,
				description: `Approval type created: ${approvalType.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:approvalType:list:*");
				await invalidateCache.byPattern("cache:workflowApprovalLevel:list:*");
				approvalTypeLogger.info("ApprovalType cache invalidated after creation");
			} catch (cacheError) {
				approvalTypeLogger.warn(
					"Failed to invalidate cache after approvalType creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				"Approval type created successfully",
				{ approvalType },
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			approvalTypeLogger.error(`Failed to create approval type: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, approvalTypeLogger);

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

		approvalTypeLogger.info(
			`Getting approval types, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.ApprovalTypeWhereInput = {};

			const searchFields = ["role", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("ApprovalType", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("ApprovalType", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [approvalTypes, total] = await Promise.all([
				document ? prisma.approvalType.findMany(findManyQuery) : [],
				count ? prisma.approvalType.count({ where: whereClause }) : 0,
			]);

			approvalTypeLogger.info(`Retrieved ${approvalTypes.length} approval types`);
			const processedData =
				groupBy && document
					? groupDataByField(approvalTypes, groupBy as string)
					: approvalTypes;

			const responseData: Record<string, any> = {
				...(document && { approvalTypes: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse("Approval types retrieved successfully", responseData, 200),
			);
		} catch (error) {
			approvalTypeLogger.error(`Failed to get approval types: ${error}`);
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
				approvalTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				approvalTypeLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			approvalTypeLogger.info(`Getting approval type by ID: ${id}`);

			const cacheKey = `cache:approvalType:byId:${id}:${fields || "full"}`;
			let approvalType = null;

			try {
				if (redisClient.isClientConnected()) {
					approvalType = await redisClient.getJSON(cacheKey);
					if (approvalType) {
						approvalTypeLogger.info(`ApprovalType ${id} retrieved from cache`);
					}
				}
			} catch (cacheError) {
				approvalTypeLogger.warn(
					`Redis cache retrieval failed for approvalType ${id}:`,
					cacheError,
				);
			}

			if (!approvalType) {
				const query: Prisma.ApprovalTypeFindFirstArgs = { where: { id } };

				query.select = getNestedFields(fields);

				approvalType = await prisma.approvalType.findFirst(query);

				if (approvalType && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, approvalType, 3600);
						approvalTypeLogger.info(`ApprovalType ${id} stored in cache`);
					} catch (cacheError) {
						approvalTypeLogger.warn(
							`Failed to store approvalType ${id} in cache:`,
							cacheError,
						);
					}
				}
			}

			if (!approvalType) {
				approvalTypeLogger.error(`Approval type not found: ${id}`);
				const errorResponse = buildErrorResponse("Approval type not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			approvalTypeLogger.info(`Approval type retrieved: ${(approvalType as any).id}`);
			const successResponse = buildSuccessResponse(
				"Approval type retrieved successfully",
				approvalType,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalTypeLogger.error(`Error getting approval type: ${error}`);
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
				approvalTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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

			const validationResult = UpdateApprovalTypeSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				approvalTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				approvalTypeLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			approvalTypeLogger.info(`Updating approval type: ${id}`);

			const existingApprovalType = await prisma.approvalType.findFirst({
				where: { id },
			});

			if (!existingApprovalType) {
				approvalTypeLogger.error(`Approval type not found: ${id}`);
				const errorResponse = buildErrorResponse("Approval type not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedApprovalType = await prisma.approvalType.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:approvalType:byId:${id}:*`);
				await invalidateCache.byPattern("cache:approvalType:list:*");
				await invalidateCache.byPattern("cache:workflowApprovalLevel:list:*");
				approvalTypeLogger.info(`Cache invalidated after approvalType ${id} update`);
			} catch (cacheError) {
				approvalTypeLogger.warn(
					"Failed to invalidate cache after approvalType update:",
					cacheError,
				);
			}

			approvalTypeLogger.info(`Approval type updated: ${updatedApprovalType.id}`);
			const successResponse = buildSuccessResponse(
				"Approval type updated successfully",
				{ approvalType: updatedApprovalType },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalTypeLogger.error(`Error updating approval type: ${error}`);
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
				approvalTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			approvalTypeLogger.info(`Deleting approval type: ${id}`);

			const existingApprovalType = await prisma.approvalType.findFirst({
				where: { id },
			});

			if (!existingApprovalType) {
				approvalTypeLogger.error(`Approval type not found: ${id}`);
				const errorResponse = buildErrorResponse("Approval type not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.approvalType.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:approvalType:byId:${id}:*`);
				await invalidateCache.byPattern("cache:approvalType:list:*");
				await invalidateCache.byPattern("cache:workflowApprovalLevel:list:*");
				approvalTypeLogger.info(`Cache invalidated after approvalType ${id} deletion`);
			} catch (cacheError) {
				approvalTypeLogger.warn(
					"Failed to invalidate cache after approvalType deletion:",
					cacheError,
				);
			}

			approvalTypeLogger.info(`Approval type deleted: ${id}`);
			const successResponse = buildSuccessResponse(
				"Approval type deleted successfully",
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalTypeLogger.error(`Failed to delete approval type: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
