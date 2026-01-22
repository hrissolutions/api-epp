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
	CreateTransactionSchema,
	UpdateTransactionSchema,
	ReconcileTransactionSchema,
	RecordPaymentSchema,
} from "../../zod/transaction.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const transactionLogger = logger.child({ module: "transaction" });

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
			transactionLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			requestData = convertStringNumbers(requestData);
			transactionLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateTransactionSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			transactionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const transaction = await prisma.transaction.create({ data: validation.data as any });
			transactionLogger.info(`Transaction created successfully: ${transaction.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "CREATE_TRANSACTION",
				description: `Transaction created: ${transaction.transactionNumber}`,
				page: {
					url: req.originalUrl,
					title: "Transaction Creation",
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: "TRANSACTION",
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: "TRANSACTION",
				entityId: transaction.id,
				changesBefore: null,
				changesAfter: {
					id: transaction.id,
					transactionNumber: transaction.transactionNumber,
					type: transaction.type,
					status: transaction.status,
					totalAmount: transaction.totalAmount,
					paidAmount: transaction.paidAmount,
					balance: transaction.balance,
				},
				description: `Transaction created: ${transaction.transactionNumber}`,
			});

			try {
				await invalidateCache.byPattern("cache:transaction:list:*");
				transactionLogger.info("Transaction list cache invalidated after creation");
			} catch (cacheError) {
				transactionLogger.warn(
					"Failed to invalidate cache after transaction creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				"Transaction created successfully",
				transaction,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			transactionLogger.error(`Failed to create transaction: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, transactionLogger);

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

		transactionLogger.info(
			`Getting transactions, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.TransactionWhereInput = {};

			// Search fields for transactions
			const searchFields = [
				"transactionNumber",
				"employeeId",
				"orderId",
				"type",
				"status",
				"paymentMethod",
				"receiptNumber",
				"payrollBatchId",
			];
			if (query) {
				const searchConditions = buildSearchConditions("Transaction", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Transaction", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [transactions, total] = await Promise.all([
				document ? prisma.transaction.findMany(findManyQuery) : [],
				count ? prisma.transaction.count({ where: whereClause }) : 0,
			]);

			transactionLogger.info(`Retrieved ${transactions.length} transactions`);
			const processedData =
				groupBy && document
					? groupDataByField(transactions, groupBy as string)
					: transactions;

			const responseData: Record<string, any> = {
				...(document && { transactions: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse("Transactions retrieved successfully", responseData, 200),
			);
		} catch (error) {
			transactionLogger.error(`Failed to get transactions: ${error}`);
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
				transactionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				transactionLogger.error(`Invalid fields parameter: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			transactionLogger.info(`Getting transaction by ID: ${id}`);

			const cacheKey = `cache:transaction:byId:${id}:${fields || "full"}`;
			let transaction = null;

			try {
				if (redisClient.isClientConnected()) {
					transaction = await redisClient.getJSON(cacheKey);
					if (transaction) {
						transactionLogger.info(`Transaction ${id} retrieved from Redis cache`);
					}
				}
			} catch (cacheError) {
				transactionLogger.warn(
					`Redis cache retrieval failed for transaction ${id}:`,
					cacheError,
				);
			}

			if (!transaction) {
				const query: Prisma.TransactionFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				transaction = await prisma.transaction.findFirst(query);

				if (transaction && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, transaction, 3600);
						transactionLogger.info(`Transaction ${id} stored in Redis cache`);
					} catch (cacheError) {
						transactionLogger.warn(
							`Failed to store transaction ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!transaction) {
				transactionLogger.error(`Transaction not found: ${id}`);
				const errorResponse = buildErrorResponse("Transaction not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			transactionLogger.info(`Transaction retrieved: ${(transaction as any).id}`);
			const successResponse = buildSuccessResponse(
				"Transaction retrieved successfully",
				transaction,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionLogger.error(`Failed to get transaction: ${error}`);
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
				transactionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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

			const validationResult = UpdateTransactionSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				transactionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				transactionLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			transactionLogger.info(`Updating transaction: ${id}`);

			const existingTransaction = await prisma.transaction.findFirst({
				where: { id },
			});

			if (!existingTransaction) {
				transactionLogger.error(`Transaction not found: ${id}`);
				const errorResponse = buildErrorResponse("Transaction not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedTransaction = await prisma.transaction.update({
				where: { id },
				data: prismaData as any,
			});

			try {
				await invalidateCache.byPattern(`cache:transaction:byId:${id}:*`);
				await invalidateCache.byPattern("cache:transaction:list:*");
				transactionLogger.info(`Cache invalidated after transaction ${id} update`);
			} catch (cacheError) {
				transactionLogger.warn(
					"Failed to invalidate cache after transaction update:",
					cacheError,
				);
			}

			transactionLogger.info(`Transaction updated: ${updatedTransaction.id}`);
			const successResponse = buildSuccessResponse(
				"Transaction updated successfully",
				{ transaction: updatedTransaction },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionLogger.error(`Failed to update transaction: ${error}`);
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
				transactionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			transactionLogger.info(`Deleting transaction: ${id}`);

			const existingTransaction = await prisma.transaction.findFirst({
				where: { id },
			});

			if (!existingTransaction) {
				transactionLogger.error(`Transaction not found: ${id}`);
				const errorResponse = buildErrorResponse("Transaction not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.transaction.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:transaction:byId:${id}:*`);
				await invalidateCache.byPattern("cache:transaction:list:*");
				transactionLogger.info(`Cache invalidated after transaction ${id} deletion`);
			} catch (cacheError) {
				transactionLogger.warn(
					"Failed to invalidate cache after transaction deletion:",
					cacheError,
				);
			}

			transactionLogger.info(`Transaction deleted: ${id}`);
			const successResponse = buildSuccessResponse(
				"Transaction deleted successfully",
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionLogger.error(`Failed to delete transaction: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Reconcile a transaction
	 * POST /api/transaction/:id/reconcile
	 */
	const reconcileTransaction = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;

		try {
			if (!rawId) {
				transactionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			const validation = ReconcileTransactionSchema.safeParse(req.body);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				transactionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			transactionLogger.info(`Reconciling transaction: ${id}`);

			const existingTransaction = await prisma.transaction.findFirst({
				where: { id },
			});

			if (!existingTransaction) {
				transactionLogger.error(`Transaction not found: ${id}`);
				const errorResponse = buildErrorResponse("Transaction not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (existingTransaction.isReconciled) {
				transactionLogger.warn(`Transaction ${id} already reconciled`);
				const errorResponse = buildErrorResponse("Transaction already reconciled", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const updatedTransaction = await prisma.transaction.update({
				where: { id },
				data: {
					isReconciled: true,
					reconciledAt: new Date(),
					reconciledBy: validation.data.reconciledBy,
					notes: validation.data.notes || existingTransaction.notes,
				},
			});

			try {
				await invalidateCache.byPattern(`cache:transaction:byId:${id}:*`);
				await invalidateCache.byPattern("cache:transaction:list:*");
				transactionLogger.info(`Cache invalidated after reconciling transaction ${id}`);
			} catch (cacheError) {
				transactionLogger.warn(
					"Failed to invalidate cache after reconciling transaction:",
					cacheError,
				);
			}

			transactionLogger.info(`Transaction reconciled successfully: ${id}`);
			const successResponse = buildSuccessResponse(
				"Transaction reconciled successfully",
				{ transaction: updatedTransaction },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionLogger.error(`Failed to reconcile transaction: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Get transactions by order
	 * GET /api/transaction/order/:orderId
	 */
	const getByOrder = async (req: Request, res: Response, _next: NextFunction) => {
		const { orderId: rawOrderId } = req.params;

		try {
			if (!rawOrderId) {
				transactionLogger.error("Missing orderId");
				const errorResponse = buildErrorResponse("Order ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const orderId = Array.isArray(rawOrderId) ? rawOrderId[0] : rawOrderId;

			transactionLogger.info(`Getting transactions for order: ${orderId}`);

			const transactions = await prisma.transaction.findMany({
				where: { orderId },
				orderBy: { createdAt: "asc" },
			});

			const summary = {
				orderId,
				totalTransactions: transactions.length,
				totalAmount: transactions.reduce((sum, t) => sum + Number(t.totalAmount), 0),
				paidAmount: transactions.reduce((sum, t) => sum + Number(t.paidAmount), 0),
				balance: transactions.reduce((sum, t) => sum + Number(t.balance), 0),
				transactions,
			};

			transactionLogger.info(
				`Retrieved ${transactions.length} transactions for order ${orderId}`,
			);

			const successResponse = buildSuccessResponse(
				"Order transactions retrieved successfully",
				summary,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionLogger.error(`Failed to get order transactions: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Get transactions by employee
	 * GET /api/transaction/employee/:employeeId
	 */
	const getByEmployee = async (req: Request, res: Response, _next: NextFunction) => {
		const { employeeId: rawEmployeeId } = req.params;

		try {
			if (!rawEmployeeId) {
				transactionLogger.error("Missing employeeId");
				const errorResponse = buildErrorResponse("Employee ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const employeeId = Array.isArray(rawEmployeeId) ? rawEmployeeId[0] : rawEmployeeId;

			transactionLogger.info(`Getting transactions for employee: ${employeeId}`);

			const transactions = await prisma.transaction.findMany({
				where: { employeeId },
				orderBy: { createdAt: "desc" },
			});

			const summary = {
				employeeId,
				totalTransactions: transactions.length,
				totalAmount: transactions.reduce((sum, t) => sum + Number(t.totalAmount), 0),
				totalPaid: transactions.reduce((sum, t) => sum + Number(t.paidAmount), 0),
				totalBalance: transactions.reduce((sum, t) => sum + Number(t.balance), 0),
				byType: {
					PURCHASE: transactions.filter((t) => t.type === "PURCHASE").length,
					INSTALLMENT: transactions.filter((t) => t.type === "INSTALLMENT").length,
					POINTS_REDEMPTION: transactions.filter((t) => t.type === "POINTS_REDEMPTION")
						.length,
					REFUND: transactions.filter((t) => t.type === "REFUND").length,
					ADJUSTMENT: transactions.filter((t) => t.type === "ADJUSTMENT").length,
				},
				transactions,
			};

			transactionLogger.info(
				`Retrieved ${transactions.length} transactions for employee ${employeeId}`,
			);

			const successResponse = buildSuccessResponse(
				"Employee transactions retrieved successfully",
				summary,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionLogger.error(`Failed to get employee transactions: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Get unreconciled transactions
	 * GET /api/transaction/unreconciled
	 */
	const getUnreconciled = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			transactionLogger.info("Getting unreconciled transactions");

			const transactions = await prisma.transaction.findMany({
				where: {
					isReconciled: false,
					status: "COMPLETED",
				},
				orderBy: { createdAt: "asc" },
			});

			const summary = {
				totalUnreconciled: transactions.length,
				totalAmount: transactions.reduce((sum, t) => sum + Number(t.totalAmount), 0),
				totalPaid: transactions.reduce((sum, t) => sum + Number(t.paidAmount), 0),
				totalBalance: transactions.reduce((sum, t) => sum + Number(t.balance), 0),
				byPaymentMethod: {
					CASH: transactions.filter((t) => t.paymentMethod === "CASH").length,
					PAYROLL_DEDUCTION: transactions.filter(
						(t) => t.paymentMethod === "PAYROLL_DEDUCTION",
					).length,
					POINTS: transactions.filter((t) => t.paymentMethod === "POINTS").length,
					MIXED: transactions.filter((t) => t.paymentMethod === "MIXED").length,
				},
				transactions,
			};

			transactionLogger.info(`Retrieved ${transactions.length} unreconciled transactions`);

			const successResponse = buildSuccessResponse(
				"Unreconciled transactions retrieved successfully",
				summary,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionLogger.error(`Failed to get unreconciled transactions: ${error}`);
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
		reconcileTransaction,
		getByOrder,
		getByEmployee,
		getUnreconciled,
	};
};
