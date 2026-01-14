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
import { CreateCategorySchema, UpdateCategorySchema } from "../../zod/category.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const categoryLogger = logger.child({ module: "category" });

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
			categoryLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			// Convert string booleans and numbers
			requestData = convertStringNumbers(requestData);
			categoryLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateCategorySchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			categoryLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const category = await prisma.category.create({ data: validation.data as any });
			categoryLogger.info(`Category created successfully: ${category.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.CATEGORY.ACTIONS.CREATE_CATEGORY,
				description: `${config.ACTIVITY_LOG.CATEGORY.DESCRIPTIONS.CATEGORY_CREATED}: ${category.name || category.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.CATEGORY.PAGES.CATEGORY_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.CATEGORY,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.CATEGORY,
				entityId: category.id,
				changesBefore: null,
				changesAfter: {
					id: category.id,
					name: category.name,
					description: category.description,
					createdAt: category.createdAt,
					updatedAt: category.updatedAt,
				},
				description: `${config.AUDIT_LOG.CATEGORY.DESCRIPTIONS.CATEGORY_CREATED}: ${category.name || category.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:category:list:*");
				categoryLogger.info("Category list cache invalidated after creation");
			} catch (cacheError) {
				categoryLogger.warn(
					"Failed to invalidate cache after category creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.CATEGORY.CREATED,
				category,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			categoryLogger.error(`${config.ERROR.CATEGORY.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, categoryLogger);

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

		categoryLogger.info(
			`Getting categorys, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.CategoryWhereInput = {};

			// search fields for categories (name, slug, description)
			const searchFields = ["name", "slug", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("Category", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Category", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [categorys, total] = await Promise.all([
				document ? prisma.category.findMany(findManyQuery) : [],
				count ? prisma.category.count({ where: whereClause }) : 0,
			]);

			categoryLogger.info(`Retrieved ${categorys.length} categorys`);
			const processedData =
				groupBy && document ? groupDataByField(categorys, groupBy as string) : categorys;

			const responseData: Record<string, any> = {
				...(document && { categorys: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.CATEGORY.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			categoryLogger.error(`${config.ERROR.CATEGORY.GET_ALL_FAILED}: ${error}`);
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
				categoryLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				categoryLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			categoryLogger.info(`${config.SUCCESS.CATEGORY.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:category:byId:${id}:${fields || "full"}`;
			let category = null;

			try {
				if (redisClient.isClientConnected()) {
					category = await redisClient.getJSON(cacheKey);
					if (category) {
						categoryLogger.info(`Category ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				categoryLogger.warn(`Redis cache retrieval failed for category ${id}:`, cacheError);
			}

			if (!category) {
				const query: Prisma.CategoryFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				category = await prisma.category.findFirst(query);

				if (category && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, category, 3600);
						categoryLogger.info(`Category ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						categoryLogger.warn(
							`Failed to store category ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!category) {
				categoryLogger.error(`${config.ERROR.CATEGORY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CATEGORY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			categoryLogger.info(`${config.SUCCESS.CATEGORY.RETRIEVED}: ${(category as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CATEGORY.RETRIEVED,
				category,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			categoryLogger.error(`${config.ERROR.CATEGORY.ERROR_GETTING}: ${error}`);
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
				categoryLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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
				// Convert string booleans and numbers
				requestData = convertStringNumbers(requestData);
			}

			const validationResult = UpdateCategorySchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				categoryLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				categoryLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			categoryLogger.info(`Updating category: ${id}`);

			const existingCategory = await prisma.category.findFirst({
				where: { id },
			});

			if (!existingCategory) {
				categoryLogger.error(`${config.ERROR.CATEGORY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CATEGORY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedCategory = await prisma.category.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:category:byId:${id}:*`);
				await invalidateCache.byPattern("cache:category:list:*");
				categoryLogger.info(`Cache invalidated after category ${id} update`);
			} catch (cacheError) {
				categoryLogger.warn(
					"Failed to invalidate cache after category update:",
					cacheError,
				);
			}

			categoryLogger.info(`${config.SUCCESS.CATEGORY.UPDATED}: ${updatedCategory.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CATEGORY.UPDATED,
				{ category: updatedCategory },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			categoryLogger.error(`${config.ERROR.CATEGORY.ERROR_UPDATING}: ${error}`);
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
				categoryLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			categoryLogger.info(`${config.SUCCESS.CATEGORY.DELETED}: ${id}`);

			const existingCategory = await prisma.category.findFirst({
				where: { id },
			});

			if (!existingCategory) {
				categoryLogger.error(`${config.ERROR.CATEGORY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CATEGORY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.category.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:category:byId:${id}:*`);
				await invalidateCache.byPattern("cache:category:list:*");
				categoryLogger.info(`Cache invalidated after category ${id} deletion`);
			} catch (cacheError) {
				categoryLogger.warn(
					"Failed to invalidate cache after category deletion:",
					cacheError,
				);
			}

			categoryLogger.info(`${config.SUCCESS.CATEGORY.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.CATEGORY.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			categoryLogger.error(`${config.ERROR.CATEGORY.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
