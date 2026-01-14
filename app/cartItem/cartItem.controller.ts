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
import { CreateCartItemSchema, UpdateCartItemSchema } from "../../zod/cartItem.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const cartItemLogger = logger.child({ module: "cartItem" });

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
			cartItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			// Convert string numbers to actual numbers
			requestData = convertStringNumbers(requestData);
			cartItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateCartItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			cartItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const cartItem = await prisma.cartItem.create({ data: validation.data as any });
			cartItemLogger.info(`CartItem created successfully: ${cartItem.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.CARTITEM.ACTIONS.CREATE_CARTITEM,
				description: `${config.ACTIVITY_LOG.CARTITEM.DESCRIPTIONS.CARTITEM_CREATED}: ${cartItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.CARTITEM.PAGES.CARTITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.CARTITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.CARTITEM,
				entityId: cartItem.id,
				changesBefore: null,
				changesAfter: {
					id: cartItem.id,
					employeeId: cartItem.employeeId,
					productId: cartItem.productId,
					quantity: cartItem.quantity,
					createdAt: cartItem.createdAt,
					updatedAt: cartItem.updatedAt,
				},
				description: `${config.AUDIT_LOG.CARTITEM.DESCRIPTIONS.CARTITEM_CREATED}: ${cartItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:cartItem:list:*");
				cartItemLogger.info("CartItem list cache invalidated after creation");
			} catch (cacheError) {
				cartItemLogger.warn(
					"Failed to invalidate cache after cartItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.CARTITEM.CREATED,
				cartItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			cartItemLogger.error(`${config.ERROR.CARTITEM.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, cartItemLogger);

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

		cartItemLogger.info(
			`Getting cartItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.CartItemWhereInput = {};

			// search fields for cart items (employeeId, productId)
			const searchFields = ["employeeId", "productId"];
			if (query) {
				const searchConditions = buildSearchConditions("CartItem", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("CartItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [cartItems, total] = await Promise.all([
				document ? prisma.cartItem.findMany(findManyQuery) : [],
				count ? prisma.cartItem.count({ where: whereClause }) : 0,
			]);

			cartItemLogger.info(`Retrieved ${cartItems.length} cartItems`);
			const processedData =
				groupBy && document ? groupDataByField(cartItems, groupBy as string) : cartItems;

			const responseData: Record<string, any> = {
				...(document && { cartItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.CARTITEM.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			cartItemLogger.error(`${config.ERROR.CARTITEM.GET_ALL_FAILED}: ${error}`);
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
				cartItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				cartItemLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			cartItemLogger.info(`${config.SUCCESS.CARTITEM.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:cartItem:byId:${id}:${fields || "full"}`;
			let cartItem = null;

			try {
				if (redisClient.isClientConnected()) {
					cartItem = await redisClient.getJSON(cacheKey);
					if (cartItem) {
						cartItemLogger.info(`CartItem ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				cartItemLogger.warn(`Redis cache retrieval failed for cartItem ${id}:`, cacheError);
			}

			if (!cartItem) {
				const query: Prisma.CartItemFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				cartItem = await prisma.cartItem.findFirst(query);

				if (cartItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, cartItem, 3600);
						cartItemLogger.info(`CartItem ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						cartItemLogger.warn(
							`Failed to store cartItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!cartItem) {
				cartItemLogger.error(`${config.ERROR.CARTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CARTITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			cartItemLogger.info(`${config.SUCCESS.CARTITEM.RETRIEVED}: ${(cartItem as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CARTITEM.RETRIEVED,
				cartItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			cartItemLogger.error(`${config.ERROR.CARTITEM.ERROR_GETTING}: ${error}`);
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
				cartItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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

			const validationResult = UpdateCartItemSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				cartItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				cartItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			cartItemLogger.info(`Updating cartItem: ${id}`);

			const existingCartItem = await prisma.cartItem.findFirst({
				where: { id },
			});

			if (!existingCartItem) {
				cartItemLogger.error(`${config.ERROR.CARTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CARTITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedCartItem = await prisma.cartItem.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:cartItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:cartItem:list:*");
				cartItemLogger.info(`Cache invalidated after cartItem ${id} update`);
			} catch (cacheError) {
				cartItemLogger.warn(
					"Failed to invalidate cache after cartItem update:",
					cacheError,
				);
			}

			cartItemLogger.info(`${config.SUCCESS.CARTITEM.UPDATED}: ${updatedCartItem.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CARTITEM.UPDATED,
				{ cartItem: updatedCartItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			cartItemLogger.error(`${config.ERROR.CARTITEM.ERROR_UPDATING}: ${error}`);
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
				cartItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			cartItemLogger.info(`${config.SUCCESS.CARTITEM.DELETED}: ${id}`);

			const existingCartItem = await prisma.cartItem.findFirst({
				where: { id },
			});

			if (!existingCartItem) {
				cartItemLogger.error(`${config.ERROR.CARTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CARTITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.cartItem.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:cartItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:cartItem:list:*");
				cartItemLogger.info(`Cache invalidated after cartItem ${id} deletion`);
			} catch (cacheError) {
				cartItemLogger.warn(
					"Failed to invalidate cache after cartItem deletion:",
					cacheError,
				);
			}

			cartItemLogger.info(`${config.SUCCESS.CARTITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.CARTITEM.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			cartItemLogger.error(`${config.ERROR.CARTITEM.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
