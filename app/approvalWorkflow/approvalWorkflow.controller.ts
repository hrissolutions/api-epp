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
	CreateApprovalWorkflowSchema,
	UpdateApprovalWorkflowSchema,
} from "../../zod/approvalWorkflow.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const approvalWorkflowLogger = logger.child({ module: "approvalWorkflow" });

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
			approvalWorkflowLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			requestData = convertStringNumbers(requestData);
			approvalWorkflowLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateApprovalWorkflowSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			approvalWorkflowLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const approvalWorkflow = await prisma.approvalWorkflow.create({
				data: validation.data as any,
			});
			approvalWorkflowLogger.info(
				`ApprovalWorkflow created successfully: ${approvalWorkflow.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "CREATE_APPROVAL_WORKFLOW",
				description: `Approval workflow created: ${approvalWorkflow.name}`,
				page: {
					url: req.originalUrl,
					title: "Approval Workflow Creation",
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: "APPROVAL_WORKFLOW",
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: "APPROVAL_WORKFLOW",
				entityId: approvalWorkflow.id,
				changesBefore: null,
				changesAfter: approvalWorkflow,
				description: `Approval workflow created: ${approvalWorkflow.name}`,
			});

			try {
				await invalidateCache.byPattern("cache:approvalWorkflow:list:*");
				approvalWorkflowLogger.info("ApprovalWorkflow cache invalidated after creation");
			} catch (cacheError) {
				approvalWorkflowLogger.warn(
					"Failed to invalidate cache after approvalWorkflow creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				"Approval workflow created successfully",
				{ approvalWorkflow },
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			approvalWorkflowLogger.error(`Failed to create approval workflow: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, approvalWorkflowLogger);

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

		approvalWorkflowLogger.info(
			`Getting approval workflows, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.ApprovalWorkflowWhereInput = {};

			const searchFields = ["name", "description"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"ApprovalWorkflow",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("ApprovalWorkflow", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [approvalWorkflows, total] = await Promise.all([
				document ? prisma.approvalWorkflow.findMany(findManyQuery) : [],
				count ? prisma.approvalWorkflow.count({ where: whereClause }) : 0,
			]);

			approvalWorkflowLogger.info(`Retrieved ${approvalWorkflows.length} approval workflows`);
			const processedData =
				groupBy && document
					? groupDataByField(approvalWorkflows, groupBy as string)
					: approvalWorkflows;

			const responseData: Record<string, any> = {
				...(document && { approvalWorkflows: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					"Approval workflows retrieved successfully",
					responseData,
					200,
				),
			);
		} catch (error) {
			approvalWorkflowLogger.error(`Failed to get approval workflows: ${error}`);
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
				approvalWorkflowLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				approvalWorkflowLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			approvalWorkflowLogger.info(`Getting approval workflow by ID: ${id}`);

			const cacheKey = `cache:approvalWorkflow:byId:${id}:${fields || "full"}`;
			let approvalWorkflow = null;

			try {
				if (redisClient.isClientConnected()) {
					approvalWorkflow = await redisClient.getJSON(cacheKey);
					if (approvalWorkflow) {
						approvalWorkflowLogger.info(`ApprovalWorkflow ${id} retrieved from cache`);
					}
				}
			} catch (cacheError) {
				approvalWorkflowLogger.warn(
					`Redis cache retrieval failed for approvalWorkflow ${id}:`,
					cacheError,
				);
			}

			if (!approvalWorkflow) {
				const query: Prisma.ApprovalWorkflowFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				approvalWorkflow = await prisma.approvalWorkflow.findFirst(query);

				if (approvalWorkflow && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, approvalWorkflow, 3600);
						approvalWorkflowLogger.info(`ApprovalWorkflow ${id} stored in cache`);
					} catch (cacheError) {
						approvalWorkflowLogger.warn(
							`Failed to store approvalWorkflow ${id} in cache:`,
							cacheError,
						);
					}
				}
			}

			if (!approvalWorkflow) {
				approvalWorkflowLogger.error(`Approval workflow not found: ${id}`);
				const errorResponse = buildErrorResponse("Approval workflow not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			approvalWorkflowLogger.info(
				`Approval workflow retrieved: ${(approvalWorkflow as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				"Approval workflow retrieved successfully",
				approvalWorkflow,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalWorkflowLogger.error(`Error getting approval workflow: ${error}`);
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
				approvalWorkflowLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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

			const validationResult = UpdateApprovalWorkflowSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				approvalWorkflowLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				approvalWorkflowLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			approvalWorkflowLogger.info(`Updating approval workflow: ${id}`);

			const existingApprovalWorkflow = await prisma.approvalWorkflow.findFirst({
				where: { id },
			});

			if (!existingApprovalWorkflow) {
				approvalWorkflowLogger.error(`Approval workflow not found: ${id}`);
				const errorResponse = buildErrorResponse("Approval workflow not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedApprovalWorkflow = await prisma.approvalWorkflow.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:approvalWorkflow:byId:${id}:*`);
				await invalidateCache.byPattern("cache:approvalWorkflow:list:*");
				approvalWorkflowLogger.info(
					`Cache invalidated after approvalWorkflow ${id} update`,
				);
			} catch (cacheError) {
				approvalWorkflowLogger.warn(
					"Failed to invalidate cache after approvalWorkflow update:",
					cacheError,
				);
			}

			approvalWorkflowLogger.info(`Approval workflow updated: ${updatedApprovalWorkflow.id}`);
			const successResponse = buildSuccessResponse(
				"Approval workflow updated successfully",
				{ approvalWorkflow: updatedApprovalWorkflow },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalWorkflowLogger.error(`Error updating approval workflow: ${error}`);
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
				approvalWorkflowLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			approvalWorkflowLogger.info(`Deleting approval workflow: ${id}`);

			const existingApprovalWorkflow = await prisma.approvalWorkflow.findFirst({
				where: { id },
			});

			if (!existingApprovalWorkflow) {
				approvalWorkflowLogger.error(`Approval workflow not found: ${id}`);
				const errorResponse = buildErrorResponse("Approval workflow not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.approvalWorkflow.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:approvalWorkflow:byId:${id}:*`);
				await invalidateCache.byPattern("cache:approvalWorkflow:list:*");
				approvalWorkflowLogger.info(
					`Cache invalidated after approvalWorkflow ${id} deletion`,
				);
			} catch (cacheError) {
				approvalWorkflowLogger.warn(
					"Failed to invalidate cache after approvalWorkflow deletion:",
					cacheError,
				);
			}

			approvalWorkflowLogger.info(`Approval workflow deleted: ${id}`);
			const successResponse = buildSuccessResponse(
				"Approval workflow deleted successfully",
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalWorkflowLogger.error(`Failed to delete approval workflow: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
