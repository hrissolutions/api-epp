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
import { CreateSupplierSchema, UpdateSupplierSchema } from "../../zod/supplier.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const supplierLogger = logger.child({ module: "supplier" });

const convertStringBooleans = (obj: any): any => {
	if (obj === null || obj === undefined) return obj;
	if (Array.isArray(obj)) return obj.map(convertStringBooleans);
	if (typeof obj === "object" && obj.constructor === Object) {
		const converted: any = {};
		for (const [key, value] of Object.entries(obj))
			converted[key] = convertStringBooleans(value);
		return converted;
	}
	if (typeof obj === "string") {
		if (obj.toLowerCase() === "true") return true;
		if (obj.toLowerCase() === "false") return false;
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
			requestData = transformFormDataToObject(req.body);
			requestData = convertStringBooleans(requestData);
		}
		const validation = CreateSupplierSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			supplierLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}
		try {
			const supplier = await prisma.supplier.create({
				data: {
					...validation.data,
					organizationId: (req as any).organizationId || validation.data.organizationId,
				} as any,
			});
			supplierLogger.info(`Supplier created successfully: ${supplier.id}`);
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.SUPPLIER.ACTIONS.CREATE_SUPPLIER,
				description: `${config.ACTIVITY_LOG.SUPPLIER.DESCRIPTIONS.SUPPLIER_CREATED}: ${supplier.name || supplier.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SUPPLIER.PAGES.SUPPLIER_CREATION,
				},
			});
			const changesAfter = {
				id: supplier.id,
				name: supplier.name,
				code: supplier.code,
				email: supplier.email,
				...(typeof (supplier as any).address !== "undefined"
					? { address: (supplier as any).address }
					: {}),
				isActive: supplier.isActive,
				createdAt: supplier.createdAt,
				updatedAt: supplier.updatedAt,
			};

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.SUPPLIER,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SUPPLIER,
				entityId: supplier.id,
				changesBefore: null,
				changesAfter,
				description: `${config.AUDIT_LOG.SUPPLIER.DESCRIPTIONS.SUPPLIER_CREATED}: ${supplier.name || supplier.id}`,
			});
			try {
				await invalidateCache.byPattern("cache:supplier:list:*");
			} catch (cacheError) {
				supplierLogger.warn(
					"Failed to invalidate cache after supplier creation:",
					cacheError,
				);
			}
			res.status(201).json(
				buildSuccessResponse(config.SUCCESS.SUPPLIER.CREATED, supplier, 201),
			);
		} catch (error) {
			supplierLogger.error(`${config.ERROR.SUPPLIER.CREATE_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, supplierLogger);
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
		supplierLogger.info(
			`Getting suppliers, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);
		try {
			const whereClause: Prisma.SupplierWhereInput = {};
			const searchFields = [
				"name",
				"code",
				"description",
				"contactName",
				"email",
				"phone",
				"address",
			];
			if (query) {
				const searchConditions = buildSearchConditions("Supplier", query, searchFields);
				if (searchConditions.length > 0) whereClause.OR = searchConditions;
			}
			if (filter) {
				const filterConditions = buildFilterConditions("Supplier", filter);
				if (filterConditions.length > 0) whereClause.AND = filterConditions;
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);
			const [suppliers, total] = await Promise.all([
				document ? prisma.supplier.findMany(findManyQuery) : [],
				count ? prisma.supplier.count({ where: whereClause }) : 0,
			]);
			supplierLogger.info(`Retrieved ${suppliers.length} suppliers`);
			const processedData =
				groupBy && document ? groupDataByField(suppliers, groupBy as string) : suppliers;
			const responseData: Record<string, any> = {
				...(document && { suppliers: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};
			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SUPPLIER.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			supplierLogger.error(`${config.ERROR.SUPPLIER.GET_ALL_FAILED}: ${error}`);
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
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}
			const id = Array.isArray(rawId) ? rawId[0] : rawId;
			if (fields && typeof fields !== "string") {
				res.status(400).json(
					buildErrorResponse(config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING, 400),
				);
				return;
			}
			const cacheKey = `cache:supplier:byId:${id}:${fields || "full"}`;
			let supplier: any = null;
			try {
				if (redisClient.isClientConnected()) {
					supplier = await redisClient.getJSON(cacheKey);
				}
			} catch (cacheError) {
				supplierLogger.warn(`Redis cache retrieval failed for supplier ${id}:`, cacheError);
			}
			if (!supplier) {
				const query: Prisma.SupplierFindFirstArgs = { where: { id } };
				(query as any).select = getNestedFields(fields);
				supplier = await prisma.supplier.findFirst(query);
				if (supplier && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, supplier, 3600);
					} catch (cacheError) {
						supplierLogger.warn(
							`Failed to store supplier ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}
			if (!supplier) {
				supplierLogger.error(`${config.ERROR.SUPPLIER.NOT_FOUND}: ${id}`);
				res.status(404).json(buildErrorResponse(config.ERROR.SUPPLIER.NOT_FOUND, 404));
				return;
			}
			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SUPPLIER.RETRIEVED, supplier, 200),
			);
		} catch (error) {
			supplierLogger.error(`${config.ERROR.SUPPLIER.ERROR_GETTING}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;
		try {
			if (!rawId) {
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
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
				requestData = convertStringBooleans(requestData);
			}
			const validationResult = UpdateSupplierSchema.safeParse(requestData);
			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
				return;
			}
			if (Object.keys(requestData).length === 0) {
				res.status(400).json(buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400));
				return;
			}
			const existingSupplier = await prisma.supplier.findFirst({ where: { id } });
			if (!existingSupplier) {
				res.status(404).json(buildErrorResponse(config.ERROR.SUPPLIER.NOT_FOUND, 404));
				return;
			}
			const updatedSupplier = await prisma.supplier.update({
				where: { id },
				data: validationResult.data as any,
			});
			try {
				await invalidateCache.byPattern(`cache:supplier:byId:${id}:*`);
				await invalidateCache.byPattern("cache:supplier:list:*");
			} catch (cacheError) {
				supplierLogger.warn(
					"Failed to invalidate cache after supplier update:",
					cacheError,
				);
			}
			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.SUPPLIER.UPDATED,
					{ supplier: updatedSupplier },
					200,
				),
			);
		} catch (error) {
			supplierLogger.error(`${config.ERROR.SUPPLIER.ERROR_UPDATING}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;
		try {
			if (!rawId) {
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}
			const id = Array.isArray(rawId) ? rawId[0] : rawId;
			const existingSupplier = await prisma.supplier.findFirst({ where: { id } });
			if (!existingSupplier) {
				res.status(404).json(buildErrorResponse(config.ERROR.SUPPLIER.NOT_FOUND, 404));
				return;
			}
			await prisma.supplier.delete({ where: { id } });
			try {
				await invalidateCache.byPattern(`cache:supplier:byId:${id}:*`);
				await invalidateCache.byPattern("cache:supplier:list:*");
			} catch (cacheError) {
				supplierLogger.warn(
					"Failed to invalidate cache after supplier deletion:",
					cacheError,
				);
			}
			res.status(200).json(buildSuccessResponse(config.SUCCESS.SUPPLIER.DELETED, {}, 200));
		} catch (error) {
			supplierLogger.error(`${config.ERROR.SUPPLIER.DELETE_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	return { create, getAll, getById, update, remove };
};
