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
import { CreateInstallmentSchema, UpdateInstallmentSchema } from "../../zod/installment.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import {
	markInstallmentAsDeducted,
	getPendingInstallmentsForPayroll,
	getOrderInstallmentSummary,
} from "../../helper/installmentService";

const logger = getLogger();
const installmentLogger = logger.child({ module: "installment" });

// Helper to convert numeric strings to numbers (for form-data)
const convertStringNumbers = (obj: any): any => {
	if (obj === null || obj === undefined) return obj;
	if (Array.isArray(obj)) return obj.map(convertStringNumbers);
	if (typeof obj === "object" && obj.constructor === Object) {
		const converted: any = {};
		for (const [k, v] of Object.entries(obj)) {
			converted[k] = convertStringNumbers(v);
		}
		return converted;
	}
	if (typeof obj === "string") {
		if (/^-?\d+\.?\d*$/.test(obj.trim())) {
			const num = parseFloat(obj);
			if (!Number.isNaN(num)) return num;
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
			installmentLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			requestData = convertStringNumbers(requestData);
			installmentLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateInstallmentSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			installmentLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const installment = await prisma.installment.create({
				data: {
					...validation.data,
					organizationId: (req as any).organizationId || validation.data.organizationId,
				} as any,
			});
			installmentLogger.info(`Installment created successfully: ${installment.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.INSTALLMENT.ACTIONS.CREATE_INSTALLMENT,
				description: `${config.ACTIVITY_LOG.INSTALLMENT.DESCRIPTIONS.INSTALLMENT_CREATED}: ${installment.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.INSTALLMENT.PAGES.INSTALLMENT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.INSTALLMENT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.INSTALLMENT,
				entityId: installment.id,
				changesBefore: null,
				changesAfter: {
					id: installment.id,
					orderId: installment.orderId,
					installmentNumber: installment.installmentNumber,
					amount: installment.amount,
					status: installment.status,
					cutOffDate: installment.cutOffDate,
					scheduledDate: installment.scheduledDate,
					deductedDate: installment.deductedDate,
				},
				description: `${config.AUDIT_LOG.INSTALLMENT.DESCRIPTIONS.INSTALLMENT_CREATED}: ${installment.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:installment:list:*");
				installmentLogger.info("Installment list cache invalidated after creation");
			} catch (cacheError) {
				installmentLogger.warn(
					"Failed to invalidate cache after installment creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.INSTALLMENT.CREATED,
				installment,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			installmentLogger.error(`${config.ERROR.INSTALLMENT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, installmentLogger);

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

		installmentLogger.info(
			`Getting installments, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.InstallmentWhereInput = {};

			// search fields relevant to installments
			const searchFields = ["orderId", "status", "payrollBatchId", "deductionReference"];
			if (query) {
				const searchConditions = buildSearchConditions("Installment", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Installment", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [installments, total] = await Promise.all([
				document ? prisma.installment.findMany(findManyQuery) : [],
				count ? prisma.installment.count({ where: whereClause }) : 0,
			]);

			installmentLogger.info(`Retrieved ${installments.length} installments`);
			const processedData =
				groupBy && document
					? groupDataByField(installments, groupBy as string)
					: installments;

			const responseData: Record<string, any> = {
				...(document && { installments: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.INSTALLMENT.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			installmentLogger.error(`${config.ERROR.INSTALLMENT.GET_ALL_FAILED}: ${error}`);
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
				installmentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				installmentLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			installmentLogger.info(`${config.SUCCESS.INSTALLMENT.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:installment:byId:${id}:${fields || "full"}`;
			let installment = null;

			try {
				if (redisClient.isClientConnected()) {
					installment = await redisClient.getJSON(cacheKey);
					if (installment) {
						installmentLogger.info(
							`Installment ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				installmentLogger.warn(
					`Redis cache retrieval failed for installment ${id}:`,
					cacheError,
				);
			}

			if (!installment) {
				const query: Prisma.InstallmentFindFirstArgs = { where: { id } };

				query.select = getNestedFields(fields);

				installment = await prisma.installment.findFirst(query);

				if (installment && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, installment, 3600);
						installmentLogger.info(`Installment ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						installmentLogger.warn(
							`Failed to store installment ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!installment) {
				installmentLogger.error(`${config.ERROR.INSTALLMENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.INSTALLMENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			installmentLogger.info(
				`${config.SUCCESS.INSTALLMENT.RETRIEVED}: ${(installment as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.INSTALLMENT.RETRIEVED,
				installment,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			installmentLogger.error(`${config.ERROR.INSTALLMENT.ERROR_GETTING}: ${error}`);
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
				installmentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
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

			const validationResult = UpdateInstallmentSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				installmentLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				installmentLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			installmentLogger.info(`Updating installment: ${id}`);

			const existingInstallment = await prisma.installment.findFirst({
				where: { id },
			});

			if (!existingInstallment) {
				installmentLogger.error(`${config.ERROR.INSTALLMENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.INSTALLMENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedInstallment = await prisma.installment.update({
				where: { id },
				data: prismaData as any,
			});

			try {
				await invalidateCache.byPattern(`cache:installment:byId:${id}:*`);
				await invalidateCache.byPattern("cache:installment:list:*");
				installmentLogger.info(`Cache invalidated after installment ${id} update`);
			} catch (cacheError) {
				installmentLogger.warn(
					"Failed to invalidate cache after installment update:",
					cacheError,
				);
			}

			installmentLogger.info(
				`${config.SUCCESS.INSTALLMENT.UPDATED}: ${updatedInstallment.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.INSTALLMENT.UPDATED,
				{ installment: updatedInstallment },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			installmentLogger.error(`${config.ERROR.INSTALLMENT.ERROR_UPDATING}: ${error}`);
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
				installmentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			installmentLogger.info(`${config.SUCCESS.INSTALLMENT.DELETED}: ${id}`);

			const existingInstallment = await prisma.installment.findFirst({
				where: { id },
			});

			if (!existingInstallment) {
				installmentLogger.error(`${config.ERROR.INSTALLMENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.INSTALLMENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.installment.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:installment:byId:${id}:*`);
				await invalidateCache.byPattern("cache:installment:list:*");
				installmentLogger.info(`Cache invalidated after installment ${id} deletion`);
			} catch (cacheError) {
				installmentLogger.warn(
					"Failed to invalidate cache after installment deletion:",
					cacheError,
				);
			}

			installmentLogger.info(`${config.SUCCESS.INSTALLMENT.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.INSTALLMENT.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			installmentLogger.error(`${config.ERROR.INSTALLMENT.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Mark installment as deducted from payroll
	 * POST /api/installments/:id/deduct
	 */
	const markAsDeducted = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;
		const { payrollBatchId, deductionReference } = req.body;

		try {
			if (!rawId) {
				installmentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			installmentLogger.info(`Marking installment ${id} as deducted`);

			const existingInstallment = await prisma.installment.findFirst({
				where: { id },
			});

			if (!existingInstallment) {
				installmentLogger.error(`${config.ERROR.INSTALLMENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.INSTALLMENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const updatedInstallment = await markInstallmentAsDeducted(
				prisma,
				id,
				payrollBatchId,
				deductionReference,
			);

			try {
				await invalidateCache.byPattern(`cache:installment:byId:${id}:*`);
				await invalidateCache.byPattern("cache:installment:list:*");
				installmentLogger.info(
					`Cache invalidated after installment ${id} marked as deducted`,
				);
			} catch (cacheError) {
				installmentLogger.warn(
					"Failed to invalidate cache after marking installment as deducted:",
					cacheError,
				);
			}

			installmentLogger.info(`Installment ${id} marked as deducted successfully`);
			const successResponse = buildSuccessResponse(
				"Installment marked as deducted",
				{ installment: updatedInstallment },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			installmentLogger.error(`Failed to mark installment as deducted: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Get pending installments for payroll processing
	 * GET /api/installments/pending-payroll?cutoffDate=YYYY-MM-DD
	 */
	const getPendingForPayroll = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const { cutoffDate } = req.query;

			let cutoffDateObj = new Date();
			if (cutoffDate && typeof cutoffDate === "string") {
				cutoffDateObj = new Date(cutoffDate);
				if (isNaN(cutoffDateObj.getTime())) {
					installmentLogger.error("Invalid cutoff date format");
					const errorResponse = buildErrorResponse("Invalid cutoff date format", 400);
					res.status(400).json(errorResponse);
					return;
				}
			}

			installmentLogger.info(
				`Getting pending installments for cutoff date: ${cutoffDateObj.toISOString()}`,
			);

			const pendingInstallments = await getPendingInstallmentsForPayroll(
				prisma,
				cutoffDateObj,
			);

			const summary = {
				cutoffDate: cutoffDateObj,
				totalPending: pendingInstallments.length,
				totalAmount: pendingInstallments.reduce((sum, inst) => sum + inst.amount, 0),
				installments: pendingInstallments,
			};

			installmentLogger.info(
				`Found ${pendingInstallments.length} pending installments (total: ${summary.totalAmount})`,
			);

			const successResponse = buildSuccessResponse(
				"Pending installments retrieved successfully",
				summary,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			installmentLogger.error(`Failed to get pending installments: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Get installment summary for a specific order
	 * GET /api/installments/order/:orderId/summary
	 */
	const getOrderSummary = async (req: Request, res: Response, _next: NextFunction) => {
		const { orderId: rawOrderId } = req.params;

		try {
			if (!rawOrderId) {
				installmentLogger.error("Missing orderId");
				const errorResponse = buildErrorResponse("Order ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure orderId is a string
			const orderId = Array.isArray(rawOrderId) ? rawOrderId[0] : rawOrderId;

			installmentLogger.info(`Getting installment summary for order: ${orderId}`);

			const summary = await getOrderInstallmentSummary(prisma, orderId);

			installmentLogger.info(
				`Installment summary for order ${orderId}: ` +
					`${summary.paidCount}/${summary.totalInstallments} paid, ` +
					`remaining: ${summary.remainingAmount}`,
			);

			const successResponse = buildSuccessResponse(
				"Order installment summary retrieved successfully",
				summary,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			installmentLogger.error(`Failed to get order installment summary: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return {
		create,
		getAll,
		getById,
		update,
		remove,
		markAsDeducted,
		getPendingForPayroll,
		getOrderSummary,
	};
};
