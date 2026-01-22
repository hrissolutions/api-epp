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
import { CreateOrderItemSchema, UpdateOrderItemSchema } from "../../zod/orderItem.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const orderItemLogger = logger.child({ module: "orderItem" });

/** Normalize field names for OrderItem: `items` → `item`, `product` → `item` (relation is `item`). */
const normalizeOrderItemFields = (fields?: string): string | undefined => {
	if (!fields || typeof fields !== "string") return fields;
	return fields
		.split(",")
		.map((f) =>
			f
				.trim()
				.replace(/^product\./g, "item.")
				.replace(/^product$/g, "item")
				.replace(/^items\./g, "item.")
				.replace(/^items$/g, "item"),
		)
		.join(",");
};

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
		// Check if string is a valid number (including decimals and negative)
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
			orderItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			// Convert string numbers to actual numbers
			requestData = convertStringNumbers(requestData);
			orderItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateOrderItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			orderItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const orderItem = await prisma.orderItem.create({ data: validation.data as any });
			orderItemLogger.info(`OrderItem created successfully: ${orderItem.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.ORDERITEM.ACTIONS.CREATE_ORDERITEM,
				description: `${config.ACTIVITY_LOG.ORDERITEM.DESCRIPTIONS.ORDERITEM_CREATED}: ${orderItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.ORDERITEM.PAGES.ORDERITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.ORDERITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.ORDERITEM,
				entityId: orderItem.id,
				changesBefore: null,
				changesAfter: {
					id: orderItem.id,
					orderId: orderItem.orderId,
					itemId: orderItem.itemId,
					quantity: orderItem.quantity,
					subtotal: orderItem.subtotal,
					createdAt: orderItem.createdAt,
				},
				description: `${config.AUDIT_LOG.ORDERITEM.DESCRIPTIONS.ORDERITEM_CREATED}: ${orderItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:orderItem:list:*");
				orderItemLogger.info("OrderItem list cache invalidated after creation");
			} catch (cacheError) {
				orderItemLogger.warn(
					"Failed to invalidate cache after orderItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.ORDERITEM.CREATED,
				orderItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			orderItemLogger.error(`${config.ERROR.ORDERITEM.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, orderItemLogger);

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

		orderItemLogger.info(
			`Getting orderItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.OrderItemWhereInput = {};

			// search fields for orderItems (orderId, productId)
			const searchFields = ["orderId", "productId"];
			if (query) {
				const searchConditions = buildSearchConditions("OrderItem", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("OrderItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const normalizedFields = normalizeOrderItemFields(fields);
			const findManyQuery = buildFindManyQuery(
				whereClause,
				skip,
				limit,
				order,
				sort,
				normalizedFields,
			);

			const [orderItems, total] = await Promise.all([
				document ? prisma.orderItem.findMany(findManyQuery) : [],
				count ? prisma.orderItem.count({ where: whereClause }) : 0,
			]);

			orderItemLogger.info(`Retrieved ${orderItems.length} orderItems`);
			const processedData =
				groupBy && document ? groupDataByField(orderItems, groupBy as string) : orderItems;

			const responseData: Record<string, any> = {
				...(document && { orderItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.ORDERITEM.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			orderItemLogger.error(`${config.ERROR.ORDERITEM.GET_ALL_FAILED}: ${error}`);
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
				orderItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				orderItemLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			orderItemLogger.info(`${config.SUCCESS.ORDERITEM.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:orderItem:byId:${id}:${fields || "full"}`;
			let orderItem = null;

			try {
				if (redisClient.isClientConnected()) {
					orderItem = await redisClient.getJSON(cacheKey);
					if (orderItem) {
						orderItemLogger.info(`OrderItem ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				orderItemLogger.warn(
					`Redis cache retrieval failed for orderItem ${id}:`,
					cacheError,
				);
			}

			if (!orderItem) {
				const query: Prisma.OrderItemFindFirstArgs = {
					where: { id },
				};

				const normalizedFields = normalizeOrderItemFields(fields);
				query.select = getNestedFields(normalizedFields);

				orderItem = await prisma.orderItem.findFirst(query);

				if (orderItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, orderItem, 3600);
						orderItemLogger.info(`OrderItem ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						orderItemLogger.warn(
							`Failed to store orderItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!orderItem) {
				orderItemLogger.error(`${config.ERROR.ORDERITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ORDERITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			orderItemLogger.info(`${config.SUCCESS.ORDERITEM.RETRIEVED}: ${(orderItem as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ORDERITEM.RETRIEVED,
				orderItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			orderItemLogger.error(`${config.ERROR.ORDERITEM.ERROR_GETTING}: ${error}`);
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
				orderItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			let requestData = req.body;
			const contentType = req.get("Content-Type") || "";

			// Handle form data transformation for update as well
			if (
				contentType.includes("application/x-www-form-urlencoded") ||
				contentType.includes("multipart/form-data")
			) {
				requestData = transformFormDataToObject(req.body);
				// Convert string numbers to actual numbers
				requestData = convertStringNumbers(requestData);
			}

			const validationResult = UpdateOrderItemSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				orderItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				orderItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			orderItemLogger.info(`Updating orderItem: ${id}`);

			const existingOrderItem = await prisma.orderItem.findFirst({
				where: { id },
			});

			if (!existingOrderItem) {
				orderItemLogger.error(`${config.ERROR.ORDERITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ORDERITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedOrderItem = await prisma.orderItem.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:orderItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:orderItem:list:*");
				orderItemLogger.info(`Cache invalidated after orderItem ${id} update`);
			} catch (cacheError) {
				orderItemLogger.warn(
					"Failed to invalidate cache after orderItem update:",
					cacheError,
				);
			}

			orderItemLogger.info(`${config.SUCCESS.ORDERITEM.UPDATED}: ${updatedOrderItem.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ORDERITEM.UPDATED,
				{ orderItem: updatedOrderItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			orderItemLogger.error(`${config.ERROR.ORDERITEM.ERROR_UPDATING}: ${error}`);
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
				orderItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			orderItemLogger.info(`${config.SUCCESS.ORDERITEM.DELETED}: ${id}`);

			const existingOrderItem = await prisma.orderItem.findFirst({
				where: { id },
			});

			if (!existingOrderItem) {
				orderItemLogger.error(`${config.ERROR.ORDERITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ORDERITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.orderItem.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:orderItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:orderItem:list:*");
				orderItemLogger.info(`Cache invalidated after orderItem ${id} deletion`);
			} catch (cacheError) {
				orderItemLogger.warn(
					"Failed to invalidate cache after orderItem deletion:",
					cacheError,
				);
			}

			orderItemLogger.info(`${config.SUCCESS.ORDERITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.ORDERITEM.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			orderItemLogger.error(`${config.ERROR.ORDERITEM.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
