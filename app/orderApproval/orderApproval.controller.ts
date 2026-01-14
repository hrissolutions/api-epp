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
import { CreateOrderApprovalSchema, UpdateOrderApprovalSchema } from "../../zod/orderApproval.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { processApproval } from "../../helper/approvalService";

const logger = getLogger();
const orderApprovalLogger = logger.child({ module: "orderApproval" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			orderApprovalLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			orderApprovalLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateOrderApprovalSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			orderApprovalLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const orderApproval = await prisma.orderApproval.create({ data: validation.data as any });
			orderApprovalLogger.info(`OrderApproval created successfully: ${orderApproval.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "CREATE_ORDER_APPROVAL",
				description: `Order approval created for order: ${orderApproval.orderId}`,
				page: {
					url: req.originalUrl,
					title: "Order Approval Creation",
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: "ORDER_APPROVAL",
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: "ORDER_APPROVAL",
				entityId: orderApproval.id,
				changesBefore: null,
				changesAfter: orderApproval,
				description: `Order approval created: ${orderApproval.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:orderApproval:list:*");
				await invalidateCache.byPattern(`cache:orderApproval:byOrderId:${orderApproval.orderId}:*`);
				orderApprovalLogger.info("OrderApproval cache invalidated after creation");
			} catch (cacheError) {
				orderApprovalLogger.warn(
					"Failed to invalidate cache after orderApproval creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				"Order approval created successfully",
				{ orderApproval },
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			orderApprovalLogger.error(`Failed to create order approval: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, orderApprovalLogger);

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

		orderApprovalLogger.info(
			`Getting order approvals, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.OrderApprovalWhereInput = {};

			const searchFields = ["orderId", "approverId", "approverName", "approverEmail", "status"];
			if (query) {
				const searchConditions = buildSearchConditions("OrderApproval", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("OrderApproval", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [orderApprovals, total] = await Promise.all([
				document ? prisma.orderApproval.findMany(findManyQuery) : [],
				count ? prisma.orderApproval.count({ where: whereClause }) : 0,
			]);

			orderApprovalLogger.info(`Retrieved ${orderApprovals.length} order approvals`);
			const processedData =
				groupBy && document ? groupDataByField(orderApprovals, groupBy as string) : orderApprovals;

			const responseData: Record<string, any> = {
				...(document && { orderApprovals: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse("Order approvals retrieved successfully", responseData, 200),
			);
		} catch (error) {
			orderApprovalLogger.error(`Failed to get order approvals: ${error}`);
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
				orderApprovalLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				orderApprovalLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			orderApprovalLogger.info(`Getting order approval by ID: ${id}`);

			const cacheKey = `cache:orderApproval:byId:${id}:${fields || "full"}`;
			let orderApproval = null;

			try {
				if (redisClient.isClientConnected()) {
					orderApproval = await redisClient.getJSON(cacheKey);
					if (orderApproval) {
						orderApprovalLogger.info(`OrderApproval ${id} retrieved from cache`);
					}
				}
			} catch (cacheError) {
				orderApprovalLogger.warn(`Redis cache retrieval failed for orderApproval ${id}:`, cacheError);
			}

			if (!orderApproval) {
				const query: Prisma.OrderApprovalFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				orderApproval = await prisma.orderApproval.findFirst(query);

				if (orderApproval && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, orderApproval, 3600);
						orderApprovalLogger.info(`OrderApproval ${id} stored in cache`);
					} catch (cacheError) {
						orderApprovalLogger.warn(
							`Failed to store orderApproval ${id} in cache:`,
							cacheError,
						);
					}
				}
			}

			if (!orderApproval) {
				orderApprovalLogger.error(`Order approval not found: ${id}`);
				const errorResponse = buildErrorResponse("Order approval not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			orderApprovalLogger.info(`Order approval retrieved: ${(orderApproval as any).id}`);
			const successResponse = buildSuccessResponse(
				"Order approval retrieved successfully",
				orderApproval,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			orderApprovalLogger.error(`Error getting order approval: ${error}`);
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
				orderApprovalLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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
			}

			const validationResult = UpdateOrderApprovalSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				orderApprovalLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				orderApprovalLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			orderApprovalLogger.info(`Updating order approval: ${id}`);

			const existingOrderApproval = await prisma.orderApproval.findFirst({
				where: { id },
			});

			if (!existingOrderApproval) {
				orderApprovalLogger.error(`Order approval not found: ${id}`);
				const errorResponse = buildErrorResponse("Order approval not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedOrderApproval = await prisma.orderApproval.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:orderApproval:byId:${id}:*`);
				await invalidateCache.byPattern("cache:orderApproval:list:*");
				await invalidateCache.byPattern(`cache:orderApproval:byOrderId:${updatedOrderApproval.orderId}:*`);
				orderApprovalLogger.info(`Cache invalidated after orderApproval ${id} update`);
			} catch (cacheError) {
				orderApprovalLogger.warn(
					"Failed to invalidate cache after orderApproval update:",
					cacheError,
				);
			}

			orderApprovalLogger.info(`Order approval updated: ${updatedOrderApproval.id}`);
			const successResponse = buildSuccessResponse(
				"Order approval updated successfully",
				{ orderApproval: updatedOrderApproval },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			orderApprovalLogger.error(`Error updating order approval: ${error}`);
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
				orderApprovalLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			orderApprovalLogger.info(`Deleting order approval: ${id}`);

			const existingOrderApproval = await prisma.orderApproval.findFirst({
				where: { id },
			});

			if (!existingOrderApproval) {
				orderApprovalLogger.error(`Order approval not found: ${id}`);
				const errorResponse = buildErrorResponse("Order approval not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.orderApproval.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:orderApproval:byId:${id}:*`);
				await invalidateCache.byPattern("cache:orderApproval:list:*");
				await invalidateCache.byPattern(`cache:orderApproval:byOrderId:${existingOrderApproval.orderId}:*`);
				orderApprovalLogger.info(`Cache invalidated after orderApproval ${id} deletion`);
			} catch (cacheError) {
				orderApprovalLogger.warn(
					"Failed to invalidate cache after orderApproval deletion:",
					cacheError,
				);
			}

			orderApprovalLogger.info(`Order approval deleted: ${id}`);
			const successResponse = buildSuccessResponse("Order approval deleted successfully", {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			orderApprovalLogger.error(`Failed to delete order approval: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// Custom endpoint: Approve an order approval
	const approve = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;
		const { comments } = req.body;

		try {
			if (!rawId) {
				orderApprovalLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			orderApprovalLogger.info(`Approving order approval: ${id}`);

			const updatedApproval = await processApproval(prisma, id, "APPROVED", comments);

			try {
				await invalidateCache.byPattern(`cache:orderApproval:byId:${id}:*`);
				await invalidateCache.byPattern("cache:orderApproval:list:*");
				await invalidateCache.byPattern(`cache:order:*`);
				orderApprovalLogger.info(`Cache invalidated after approval ${id}`);
			} catch (cacheError) {
				orderApprovalLogger.warn("Failed to invalidate cache after approval:", cacheError);
			}

			orderApprovalLogger.info(`Order approval approved: ${updatedApproval.id}`);
			const successResponse = buildSuccessResponse(
				"Order approval approved successfully",
				{ orderApproval: updatedApproval },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			orderApprovalLogger.error(`Failed to approve order approval: ${error}`);
			const errorResponse = buildErrorResponse(
				error.message || config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// Custom endpoint: Reject an order approval
	const reject = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;
		const { comments } = req.body;

		try {
			if (!rawId) {
				orderApprovalLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (!comments) {
				const errorResponse = buildErrorResponse(
					"Rejection reason (comments) is required",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			orderApprovalLogger.info(`Rejecting order approval: ${id}`);

			const updatedApproval = await processApproval(prisma, id, "REJECTED", comments);

			try {
				await invalidateCache.byPattern(`cache:orderApproval:byId:${id}:*`);
				await invalidateCache.byPattern("cache:orderApproval:list:*");
				await invalidateCache.byPattern(`cache:order:*`);
				orderApprovalLogger.info(`Cache invalidated after rejection ${id}`);
			} catch (cacheError) {
				orderApprovalLogger.warn("Failed to invalidate cache after rejection:", cacheError);
			}

			orderApprovalLogger.info(`Order approval rejected: ${updatedApproval.id}`);
			const successResponse = buildSuccessResponse(
				"Order approval rejected successfully",
				{ orderApproval: updatedApproval },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			orderApprovalLogger.error(`Failed to reject order approval: ${error}`);
			const errorResponse = buildErrorResponse(
				error.message || config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove, approve, reject };
};
