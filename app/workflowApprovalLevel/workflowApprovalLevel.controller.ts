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
	CreateWorkflowApprovalLevelSchema,
	UpdateWorkflowApprovalLevelSchema,
} from "../../zod/workflowApprovalLevel.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const workflowApprovalLevelLogger = logger.child({ module: "workflowApprovalLevel" });

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
			workflowApprovalLevelLogger.info(
				"Original form data:",
				JSON.stringify(req.body, null, 2),
			);
			requestData = transformFormDataToObject(req.body);
			requestData = convertStringNumbers(requestData);
			workflowApprovalLevelLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateWorkflowApprovalLevelSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			workflowApprovalLevelLogger.error(
				`Validation failed: ${JSON.stringify(formattedErrors)}`,
			);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const workflowApprovalLevel = await prisma.workflowApprovalLevel.create({
				data: {
					...validation.data,
					organizationId: (req as any).organizationId || validation.data.organizationId,
				} as any,
			});
			workflowApprovalLevelLogger.info(
				`WorkflowApprovalLevel created successfully: ${workflowApprovalLevel.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "CREATE_WORKFLOW_APPROVAL_LEVEL",
				description: `Workflow approval level ${workflowApprovalLevel.level} created for workflow: ${workflowApprovalLevel.workflowId}`,
				page: {
					url: req.originalUrl,
					title: "Workflow Approval Level Creation",
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: "WORKFLOW_APPROVAL_LEVEL",
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: "WORKFLOW_APPROVAL_LEVEL",
				entityId: workflowApprovalLevel.id,
				changesBefore: null,
				changesAfter: workflowApprovalLevel,
				description: `Workflow approval level created: ${workflowApprovalLevel.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:workflowApprovalLevel:list:*");
				await invalidateCache.byPattern(
					`cache:workflowApprovalLevel:byWorkflowId:${workflowApprovalLevel.workflowId}:*`,
				);
				await invalidateCache.byPattern(
					`cache:workflowApprovalLevel:byApprovalLevelId:${workflowApprovalLevel.approvalLevelId}:*`,
				);
				workflowApprovalLevelLogger.info(
					"WorkflowApprovalLevel cache invalidated after creation",
				);
			} catch (cacheError) {
				workflowApprovalLevelLogger.warn(
					"Failed to invalidate cache after workflowApprovalLevel creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				"Workflow approval level created successfully",
				{ workflowApprovalLevel },
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			workflowApprovalLevelLogger.error(`Failed to create workflow approval level: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, workflowApprovalLevelLogger);

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

		workflowApprovalLevelLogger.info(
			`Getting workflow approval levels, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.WorkflowApprovalLevelWhereInput = {};

			const searchFields = ["workflowId", "approvalLevelId", "approverName", "approverEmail"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"WorkflowApprovalLevel",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("WorkflowApprovalLevel", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [workflowApprovalLevels, total] = await Promise.all([
				document ? prisma.workflowApprovalLevel.findMany(findManyQuery) : [],
				count ? prisma.workflowApprovalLevel.count({ where: whereClause }) : 0,
			]);

			workflowApprovalLevelLogger.info(
				`Retrieved ${workflowApprovalLevels.length} workflow approval levels`,
			);
			const processedData =
				groupBy && document
					? groupDataByField(workflowApprovalLevels, groupBy as string)
					: workflowApprovalLevels;

			const responseData: Record<string, any> = {
				...(document && { workflowApprovalLevels: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					"Workflow approval levels retrieved successfully",
					responseData,
					200,
				),
			);
		} catch (error) {
			workflowApprovalLevelLogger.error(`Failed to get workflow approval levels: ${error}`);
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
				workflowApprovalLevelLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				workflowApprovalLevelLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			workflowApprovalLevelLogger.info(`Getting workflow approval level by ID: ${id}`);

			const cacheKey = `cache:workflowApprovalLevel:byId:${id}:${fields || "full"}`;
			let workflowApprovalLevel = null;

			try {
				if (redisClient.isClientConnected()) {
					workflowApprovalLevel = await redisClient.getJSON(cacheKey);
					if (workflowApprovalLevel) {
						workflowApprovalLevelLogger.info(
							`WorkflowApprovalLevel ${id} retrieved from cache`,
						);
					}
				}
			} catch (cacheError) {
				workflowApprovalLevelLogger.warn(
					`Redis cache retrieval failed for workflowApprovalLevel ${id}:`,
					cacheError,
				);
			}

			if (!workflowApprovalLevel) {
				const query: Prisma.WorkflowApprovalLevelFindFirstArgs = { where: { id } };

				query.select = getNestedFields(fields);

				workflowApprovalLevel = await prisma.workflowApprovalLevel.findFirst(query);

				if (workflowApprovalLevel && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, workflowApprovalLevel, 3600);
						workflowApprovalLevelLogger.info(
							`WorkflowApprovalLevel ${id} stored in cache`,
						);
					} catch (cacheError) {
						workflowApprovalLevelLogger.warn(
							`Failed to store workflowApprovalLevel ${id} in cache:`,
							cacheError,
						);
					}
				}
			}

			if (!workflowApprovalLevel) {
				workflowApprovalLevelLogger.error(`Workflow approval level not found: ${id}`);
				const errorResponse = buildErrorResponse("Workflow approval level not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			workflowApprovalLevelLogger.info(
				`Workflow approval level retrieved: ${(workflowApprovalLevel as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				"Workflow approval level retrieved successfully",
				workflowApprovalLevel,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			workflowApprovalLevelLogger.error(`Error getting workflow approval level: ${error}`);
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
				workflowApprovalLevelLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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

			const validationResult = UpdateWorkflowApprovalLevelSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				workflowApprovalLevelLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				workflowApprovalLevelLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			workflowApprovalLevelLogger.info(`Updating workflow approval level: ${id}`);

			const existingWorkflowApprovalLevel = await prisma.workflowApprovalLevel.findFirst({
				where: { id },
			});

			if (!existingWorkflowApprovalLevel) {
				workflowApprovalLevelLogger.error(`Workflow approval level not found: ${id}`);
				const errorResponse = buildErrorResponse("Workflow approval level not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedWorkflowApprovalLevel = await prisma.workflowApprovalLevel.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:workflowApprovalLevel:byId:${id}:*`);
				await invalidateCache.byPattern("cache:workflowApprovalLevel:list:*");
				await invalidateCache.byPattern(
					`cache:workflowApprovalLevel:byWorkflowId:${updatedWorkflowApprovalLevel.workflowId}:*`,
				);
				await invalidateCache.byPattern(
					`cache:workflowApprovalLevel:byApprovalLevelId:${updatedWorkflowApprovalLevel.approvalLevelId}:*`,
				);
				workflowApprovalLevelLogger.info(
					`Cache invalidated after workflowApprovalLevel ${id} update`,
				);
			} catch (cacheError) {
				workflowApprovalLevelLogger.warn(
					"Failed to invalidate cache after workflowApprovalLevel update:",
					cacheError,
				);
			}

			workflowApprovalLevelLogger.info(
				`Workflow approval level updated: ${updatedWorkflowApprovalLevel.id}`,
			);
			const successResponse = buildSuccessResponse(
				"Workflow approval level updated successfully",
				{ workflowApprovalLevel: updatedWorkflowApprovalLevel },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			workflowApprovalLevelLogger.error(`Error updating workflow approval level: ${error}`);
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
				workflowApprovalLevelLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			workflowApprovalLevelLogger.info(`Deleting workflow approval level: ${id}`);

			const existingWorkflowApprovalLevel = await prisma.workflowApprovalLevel.findFirst({
				where: { id },
			});

			if (!existingWorkflowApprovalLevel) {
				workflowApprovalLevelLogger.error(`Workflow approval level not found: ${id}`);
				const errorResponse = buildErrorResponse("Workflow approval level not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.workflowApprovalLevel.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:workflowApprovalLevel:byId:${id}:*`);
				await invalidateCache.byPattern("cache:workflowApprovalLevel:list:*");
				await invalidateCache.byPattern(
					`cache:workflowApprovalLevel:byWorkflowId:${existingWorkflowApprovalLevel.workflowId}:*`,
				);
				await invalidateCache.byPattern(
					`cache:workflowApprovalLevel:byApprovalLevelId:${existingWorkflowApprovalLevel.approvalLevelId}:*`,
				);
				workflowApprovalLevelLogger.info(
					`Cache invalidated after workflowApprovalLevel ${id} deletion`,
				);
			} catch (cacheError) {
				workflowApprovalLevelLogger.warn(
					"Failed to invalidate cache after workflowApprovalLevel deletion:",
					cacheError,
				);
			}

			workflowApprovalLevelLogger.info(`Workflow approval level deleted: ${id}`);
			const successResponse = buildSuccessResponse(
				"Workflow approval level deleted successfully",
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			workflowApprovalLevelLogger.error(`Failed to delete workflow approval level: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
