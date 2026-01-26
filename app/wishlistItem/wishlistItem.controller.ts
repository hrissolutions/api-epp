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
import { CreateWishlistItemSchema, UpdateWishlistItemSchema } from "../../zod/wishlistItem.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const wishlistItemLogger = logger.child({ module: "wishlistItem" });

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
			wishlistItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			// Convert string numbers to actual numbers
			requestData = convertStringNumbers(requestData);
			wishlistItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateWishlistItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			wishlistItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const wishlistItem = await prisma.wishlistItem.create({
				data: {
					...validation.data,
					organizationId: (req as any).organizationId || validation.data.organizationId,
				} as any,
			});
			wishlistItemLogger.info(`WishlistItem created successfully: ${wishlistItem.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.WISHLISTITEM.ACTIONS.CREATE_WISHLISTITEM,
				description: `${config.ACTIVITY_LOG.WISHLISTITEM.DESCRIPTIONS.WISHLISTITEM_CREATED}: ${wishlistItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WISHLISTITEM.PAGES.WISHLISTITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.WISHLISTITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.WISHLISTITEM,
				entityId: wishlistItem.id,
				changesBefore: null,
				changesAfter: {
					id: wishlistItem.id,
					employeeId: wishlistItem.employeeId,
					itemId: wishlistItem.itemId,
					createdAt: wishlistItem.createdAt,
				},
				description: `${config.AUDIT_LOG.WISHLISTITEM.DESCRIPTIONS.WISHLISTITEM_CREATED}: ${wishlistItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:wishlistItem:list:*");
				wishlistItemLogger.info("WishlistItem list cache invalidated after creation");
			} catch (cacheError) {
				wishlistItemLogger.warn(
					"Failed to invalidate cache after wishlistItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.WISHLISTITEM.CREATED,
				wishlistItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			wishlistItemLogger.error(`${config.ERROR.WISHLISTITEM.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, wishlistItemLogger);

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

		wishlistItemLogger.info(
			`Getting wishlistItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.WishlistItemWhereInput = {};

			// search fields for wishlist items (employeeId, productId)
			const searchFields = ["employeeId", "productId"];
			if (query) {
				const searchConditions = buildSearchConditions("WishlistItem", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("WishlistItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [wishlistItems, total] = await Promise.all([
				document ? prisma.wishlistItem.findMany(findManyQuery) : [],
				count ? prisma.wishlistItem.count({ where: whereClause }) : 0,
			]);

			wishlistItemLogger.info(`Retrieved ${wishlistItems.length} wishlistItems`);
			const processedData =
				groupBy && document
					? groupDataByField(wishlistItems, groupBy as string)
					: wishlistItems;

			const responseData: Record<string, any> = {
				...(document && { wishlistItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.WISHLISTITEM.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			wishlistItemLogger.error(`${config.ERROR.WISHLISTITEM.GET_ALL_FAILED}: ${error}`);
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
				wishlistItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				wishlistItemLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			wishlistItemLogger.info(`${config.SUCCESS.WISHLISTITEM.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:wishlistItem:byId:${id}:${fields || "full"}`;
			let wishlistItem = null;

			try {
				if (redisClient.isClientConnected()) {
					wishlistItem = await redisClient.getJSON(cacheKey);
					if (wishlistItem) {
						wishlistItemLogger.info(
							`WishlistItem ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				wishlistItemLogger.warn(
					`Redis cache retrieval failed for wishlistItem ${id}:`,
					cacheError,
				);
			}

			if (!wishlistItem) {
				const query: Prisma.WishlistItemFindFirstArgs = { where: { id },
				};

				query.select = getNestedFields(fields);

				wishlistItem = await prisma.wishlistItem.findFirst(query);

				if (wishlistItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, wishlistItem, 3600);
						wishlistItemLogger.info(`WishlistItem ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						wishlistItemLogger.warn(
							`Failed to store wishlistItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!wishlistItem) {
				wishlistItemLogger.error(`${config.ERROR.WISHLISTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.WISHLISTITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			wishlistItemLogger.info(
				`${config.SUCCESS.WISHLISTITEM.RETRIEVED}: ${(wishlistItem as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.WISHLISTITEM.RETRIEVED,
				wishlistItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			wishlistItemLogger.error(`${config.ERROR.WISHLISTITEM.ERROR_GETTING}: ${error}`);
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
				wishlistItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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

			const validationResult = UpdateWishlistItemSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				wishlistItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				wishlistItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			wishlistItemLogger.info(`Updating wishlistItem: ${id}`);

			const existingWishlistItem = await prisma.wishlistItem.findFirst({
				where: { id },
			});

			if (!existingWishlistItem) {
				wishlistItemLogger.error(`${config.ERROR.WISHLISTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.WISHLISTITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedWishlistItem = await prisma.wishlistItem.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:wishlistItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:wishlistItem:list:*");
				wishlistItemLogger.info(`Cache invalidated after wishlistItem ${id} update`);
			} catch (cacheError) {
				wishlistItemLogger.warn(
					"Failed to invalidate cache after wishlistItem update:",
					cacheError,
				);
			}

			wishlistItemLogger.info(
				`${config.SUCCESS.WISHLISTITEM.UPDATED}: ${updatedWishlistItem.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.WISHLISTITEM.UPDATED,
				{ wishlistItem: updatedWishlistItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			wishlistItemLogger.error(`${config.ERROR.WISHLISTITEM.ERROR_UPDATING}: ${error}`);
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
				wishlistItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			wishlistItemLogger.info(`${config.SUCCESS.WISHLISTITEM.DELETED}: ${id}`);

			const existingWishlistItem = await prisma.wishlistItem.findFirst({
				where: { id },
			});

			if (!existingWishlistItem) {
				wishlistItemLogger.error(`${config.ERROR.WISHLISTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.WISHLISTITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.wishlistItem.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:wishlistItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:wishlistItem:list:*");
				wishlistItemLogger.info(`Cache invalidated after wishlistItem ${id} deletion`);
			} catch (cacheError) {
				wishlistItemLogger.warn(
					"Failed to invalidate cache after wishlistItem deletion:",
					cacheError,
				);
			}

			wishlistItemLogger.info(`${config.SUCCESS.WISHLISTITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.WISHLISTITEM.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			wishlistItemLogger.error(`${config.ERROR.WISHLISTITEM.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
