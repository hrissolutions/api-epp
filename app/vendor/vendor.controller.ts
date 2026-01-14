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
import { CreateVendorSchema, UpdateVendorSchema } from "../../zod/vendor.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const vendorLogger = logger.child({ module: "vendor" });

// Helper function to convert string booleans to actual booleans for form data
const convertStringBooleans = (obj: any): any => {
	if (obj === null || obj === undefined) {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(convertStringBooleans);
	}

	if (typeof obj === "object" && obj.constructor === Object) {
		const converted: any = {};
		for (const [key, value] of Object.entries(obj)) {
			converted[key] = convertStringBooleans(value);
		}
		return converted;
	}

	if (typeof obj === "string") {
		// Convert string booleans to actual booleans
		if (obj.toLowerCase() === "true") {
			return true;
		}
		if (obj.toLowerCase() === "false") {
			return false;
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
			vendorLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			// Convert string booleans to actual booleans
			requestData = convertStringBooleans(requestData);
			vendorLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateVendorSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			vendorLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const vendor = await prisma.vendor.create({ data: validation.data as any });
			vendorLogger.info(`Vendor created successfully: ${vendor.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.VENDOR.ACTIONS.CREATE_VENDOR,
				description: `${config.ACTIVITY_LOG.VENDOR.DESCRIPTIONS.VENDOR_CREATED}: ${vendor.name || vendor.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.VENDOR.PAGES.VENDOR_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.VENDOR,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.VENDOR,
				entityId: vendor.id,
				changesBefore: null,
				changesAfter: {
					id: vendor.id,
					name: vendor.name,
					code: vendor.code,
					email: vendor.email,
					isActive: vendor.isActive,
					createdAt: vendor.createdAt,
					updatedAt: vendor.updatedAt,
				},
				description: `${config.AUDIT_LOG.VENDOR.DESCRIPTIONS.VENDOR_CREATED}: ${vendor.name || vendor.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:vendor:list:*");
				vendorLogger.info("Vendor list cache invalidated after creation");
			} catch (cacheError) {
				vendorLogger.warn(
					"Failed to invalidate cache after vendor creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.VENDOR.CREATED,
				vendor,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			vendorLogger.error(`${config.ERROR.VENDOR.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, vendorLogger);

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

		vendorLogger.info(
			`Getting vendors, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.VendorWhereInput = {};

			// search fields for vendors (name, code, description, contactName, email, phone)
			const searchFields = ["name", "code", "description", "contactName", "email", "phone"];
			if (query) {
				const searchConditions = buildSearchConditions("Vendor", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Vendor", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [vendors, total] = await Promise.all([
				document ? prisma.vendor.findMany(findManyQuery) : [],
				count ? prisma.vendor.count({ where: whereClause }) : 0,
			]);

			vendorLogger.info(`Retrieved ${vendors.length} vendors`);
			const processedData =
				groupBy && document ? groupDataByField(vendors, groupBy as string) : vendors;

			const responseData: Record<string, any> = {
				...(document && { vendors: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.VENDOR.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			vendorLogger.error(`${config.ERROR.VENDOR.GET_ALL_FAILED}: ${error}`);
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
				vendorLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				vendorLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			vendorLogger.info(`${config.SUCCESS.VENDOR.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:vendor:byId:${id}:${fields || "full"}`;
			let vendor = null;

			try {
				if (redisClient.isClientConnected()) {
					vendor = await redisClient.getJSON(cacheKey);
					if (vendor) {
						vendorLogger.info(`Vendor ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				vendorLogger.warn(`Redis cache retrieval failed for vendor ${id}:`, cacheError);
			}

			if (!vendor) {
				const query: Prisma.VendorFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				vendor = await prisma.vendor.findFirst(query);

				if (vendor && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, vendor, 3600);
						vendorLogger.info(`Vendor ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						vendorLogger.warn(
							`Failed to store vendor ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!vendor) {
				vendorLogger.error(`${config.ERROR.VENDOR.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.VENDOR.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			vendorLogger.info(`${config.SUCCESS.VENDOR.RETRIEVED}: ${(vendor as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.VENDOR.RETRIEVED,
				vendor,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			vendorLogger.error(`${config.ERROR.VENDOR.ERROR_GETTING}: ${error}`);
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
				vendorLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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
				// Convert string booleans to actual booleans
				requestData = convertStringBooleans(requestData);
			}

			const validationResult = UpdateVendorSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				vendorLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				vendorLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			vendorLogger.info(`Updating vendor: ${id}`);

			const existingVendor = await prisma.vendor.findFirst({
				where: { id },
			});

			if (!existingVendor) {
				vendorLogger.error(`${config.ERROR.VENDOR.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.VENDOR.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedVendor = await prisma.vendor.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:vendor:byId:${id}:*`);
				await invalidateCache.byPattern("cache:vendor:list:*");
				vendorLogger.info(`Cache invalidated after vendor ${id} update`);
			} catch (cacheError) {
				vendorLogger.warn(
					"Failed to invalidate cache after vendor update:",
					cacheError,
				);
			}

			vendorLogger.info(`${config.SUCCESS.VENDOR.UPDATED}: ${updatedVendor.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.VENDOR.UPDATED,
				{ vendor: updatedVendor },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			vendorLogger.error(`${config.ERROR.VENDOR.ERROR_UPDATING}: ${error}`);
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
				vendorLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			vendorLogger.info(`${config.SUCCESS.VENDOR.DELETED}: ${id}`);

			const existingVendor = await prisma.vendor.findFirst({
				where: { id },
			});

			if (!existingVendor) {
				vendorLogger.error(`${config.ERROR.VENDOR.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.VENDOR.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.vendor.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:vendor:byId:${id}:*`);
				await invalidateCache.byPattern("cache:vendor:list:*");
				vendorLogger.info(`Cache invalidated after vendor ${id} deletion`);
			} catch (cacheError) {
				vendorLogger.warn(
					"Failed to invalidate cache after vendor deletion:",
					cacheError,
				);
			}

			vendorLogger.info(`${config.SUCCESS.VENDOR.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.VENDOR.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			vendorLogger.error(`${config.ERROR.VENDOR.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
