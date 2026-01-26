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
import { CreatePurchaseSchema, UpdatePurchaseSchema } from "../../zod/purchase.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const purchaseLogger = logger.child({ module: "purchase" });

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
			purchaseLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			// Convert string numbers to actual numbers
			requestData = convertStringNumbers(requestData);
			purchaseLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreatePurchaseSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			purchaseLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const purchase = await prisma.purchase.create({
				data: {
					...validation.data,
					organizationId: (req as any).organizationId || validation.data.organizationId,
				} as any,
			});
			purchaseLogger.info(`Purchase created successfully: ${purchase.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.PURCHASE.ACTIONS.CREATE_PURCHASE,
				description: `${config.ACTIVITY_LOG.PURCHASE.DESCRIPTIONS.PURCHASE_CREATED}: ${purchase.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.PURCHASE.PAGES.PURCHASE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.PURCHASE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.PURCHASE,
				entityId: purchase.id,
				changesBefore: null,
				changesAfter: {
					id: purchase.id,
					employeeId: purchase.employeeId,
					itemId: purchase.itemId,
					purchaseType: purchase.purchaseType,
					totalAmount: purchase.totalAmount,
					status: purchase.status,
					createdAt: purchase.createdAt,
					updatedAt: purchase.updatedAt,
				},
				description: `${config.AUDIT_LOG.PURCHASE.DESCRIPTIONS.PURCHASE_CREATED}: ${purchase.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:purchase:list:*");
				purchaseLogger.info("Purchase list cache invalidated after creation");
			} catch (cacheError) {
				purchaseLogger.warn(
					"Failed to invalidate cache after purchase creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.PURCHASE.CREATED,
				purchase,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			purchaseLogger.error(`${config.ERROR.PURCHASE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, purchaseLogger);

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

		purchaseLogger.info(
			`Getting purchases, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.PurchaseWhereInput = {};

			// search fields for purchases (employeeId, productId, purchaseType, status, notes)
			const searchFields = ["employeeId", "productId", "purchaseType", "status", "notes"];
			if (query) {
				const searchConditions = buildSearchConditions("Purchase", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Purchase", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [purchases, total] = await Promise.all([
				document ? prisma.purchase.findMany(findManyQuery) : [],
				count ? prisma.purchase.count({ where: whereClause }) : 0,
			]);

			purchaseLogger.info(`Retrieved ${purchases.length} purchases`);
			const processedData =
				groupBy && document ? groupDataByField(purchases, groupBy as string) : purchases;

			const responseData: Record<string, any> = {
				...(document && { purchases: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.PURCHASE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			purchaseLogger.error(`${config.ERROR.PURCHASE.GET_ALL_FAILED}: ${error}`);
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
				purchaseLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				purchaseLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			purchaseLogger.info(`${config.SUCCESS.PURCHASE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:purchase:byId:${id}:${fields || "full"}`;
			let purchase = null;

			try {
				if (redisClient.isClientConnected()) {
					purchase = await redisClient.getJSON(cacheKey);
					if (purchase) {
						purchaseLogger.info(`Purchase ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				purchaseLogger.warn(`Redis cache retrieval failed for purchase ${id}:`, cacheError);
			}

			if (!purchase) {
				const query: Prisma.PurchaseFindFirstArgs = { where: { id },
				};

				query.select = getNestedFields(fields);

				purchase = await prisma.purchase.findFirst(query);

				if (purchase && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, purchase, 3600);
						purchaseLogger.info(`Purchase ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						purchaseLogger.warn(
							`Failed to store purchase ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!purchase) {
				purchaseLogger.error(`${config.ERROR.PURCHASE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PURCHASE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			purchaseLogger.info(`${config.SUCCESS.PURCHASE.RETRIEVED}: ${(purchase as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PURCHASE.RETRIEVED,
				purchase,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			purchaseLogger.error(`${config.ERROR.PURCHASE.ERROR_GETTING}: ${error}`);
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
				purchaseLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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

			const validationResult = UpdatePurchaseSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				purchaseLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				purchaseLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			purchaseLogger.info(`Updating purchase: ${id}`);

			const existingPurchase = await prisma.purchase.findFirst({
				where: { id },
			});

			if (!existingPurchase) {
				purchaseLogger.error(`${config.ERROR.PURCHASE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PURCHASE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedPurchase = await prisma.purchase.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:purchase:byId:${id}:*`);
				await invalidateCache.byPattern("cache:purchase:list:*");
				purchaseLogger.info(`Cache invalidated after purchase ${id} update`);
			} catch (cacheError) {
				purchaseLogger.warn(
					"Failed to invalidate cache after purchase update:",
					cacheError,
				);
			}

			purchaseLogger.info(`${config.SUCCESS.PURCHASE.UPDATED}: ${updatedPurchase.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PURCHASE.UPDATED,
				{ purchase: updatedPurchase },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			purchaseLogger.error(`${config.ERROR.PURCHASE.ERROR_UPDATING}: ${error}`);
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
				purchaseLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			purchaseLogger.info(`${config.SUCCESS.PURCHASE.DELETED}: ${id}`);

			const existingPurchase = await prisma.purchase.findFirst({
				where: { id },
			});

			if (!existingPurchase) {
				purchaseLogger.error(`${config.ERROR.PURCHASE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PURCHASE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.purchase.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:purchase:byId:${id}:*`);
				await invalidateCache.byPattern("cache:purchase:list:*");
				purchaseLogger.info(`Cache invalidated after purchase ${id} deletion`);
			} catch (cacheError) {
				purchaseLogger.warn(
					"Failed to invalidate cache after purchase deletion:",
					cacheError,
				);
			}

			purchaseLogger.info(`${config.SUCCESS.PURCHASE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.PURCHASE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			purchaseLogger.error(`${config.ERROR.PURCHASE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
