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
import { CreateOrderSchema, UpdateOrderSchema } from "../../zod/order.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { generateInstallments } from "../../helper/installmentService";
import { createTransactionForOrder } from "../../helper/transactionService";
import { createApprovalChain } from "../../helper/approvalService";
import { generateOrderNumber } from "../../helper/generate-OrderNumber.helper";
import { calculateOrderTotals } from "../../helper/calculateOrderTotals.helper";

const logger = getLogger();
const orderLogger = logger.child({ module: "order" });

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
			orderLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			// Convert string numbers to actual numbers
			requestData = convertStringNumbers(requestData);
			orderLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateOrderSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			orderLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Generate order number automatically
			const orderNumber = await generateOrderNumber(prisma);

			// Calculate order totals from items
			const totals = await calculateOrderTotals(prisma, validation.data.items);

			// Prepare order data with embedded items array and calculated totals
			const orderData = {
				...validation.data,
				orderNumber,
				items: totals.items, // Use calculated items with discount and subtotal
				subtotal: totals.subtotal,
				discount: totals.discount,
				tax: totals.tax,
				total: totals.total,
			};

			// Create the order first
			const order = await prisma.order.create({ data: orderData as any });
			orderLogger.info(`Order created successfully: ${order.id}`);

			// Create OrderItem records for each item
			let createdOrderItems = [];
			try {
				for (const item of totals.items) {
					const orderItem = await prisma.orderItem.create({
						data: {
							orderId: order.id,
							productId: item.productId,
							quantity: item.quantity,
							unitPrice: item.unitPrice,
							discount: item.discount,
							subtotal: item.subtotal,
						},
					});
					createdOrderItems.push(orderItem);
				}
				orderLogger.info(
					`Created ${createdOrderItems.length} OrderItem records for order ${order.id}`,
				);
			} catch (orderItemError) {
				orderLogger.error(
					`Failed to create OrderItems for order ${order.id}:`,
					orderItemError,
				);
				// Continue with other operations even if OrderItem creation fails
			}

			// Create transaction ledger for the order
			let transaction = null;
			try {
				transaction = await createTransactionForOrder(
					prisma,
					order.id,
					order.employeeId,
					order.total,
					order.paymentType,
					order.paymentMethod,
				);
				orderLogger.info(`Transaction ledger created for order ${order.id}`);
			} catch (transactionError) {
				orderLogger.error(
					`Failed to create transaction for order ${order.id}:`,
					transactionError,
				);
			}

			// Automatically generate installments if payment type is INSTALLMENT
			let generatedInstallments = null;
			if (order.paymentType === "INSTALLMENT") {
				// Use provided installmentMonths or default to 6 months if not specified
				const installmentMonths = order.installmentMonths || 6;

				// Update order with installmentMonths if it wasn't provided
				if (!order.installmentMonths) {
					await prisma.order.update({
						where: { id: order.id },
						data: { installmentMonths },
					});
					orderLogger.info(
						`Set default installmentMonths to ${installmentMonths} for order ${order.id}`,
					);
				}
				try {
					orderLogger.info(
						`Generating installments for order ${order.id}: ${installmentMonths} months`,
					);

					generatedInstallments = await generateInstallments(
						prisma,
						order.id,
						installmentMonths,
						order.total,
						order.orderDate || new Date(),
					);

					// Update order with installment details
					await prisma.order.update({
						where: { id: order.id },
						data: {
							installmentCount: generatedInstallments.length,
							installmentAmount: generatedInstallments[0]?.amount || 0,
						},
					});

					orderLogger.info(
						`Successfully generated ${generatedInstallments.length} installments for order ${order.id}`,
					);
				} catch (installmentError) {
					orderLogger.error(
						`Failed to generate installments for order ${order.id}:`,
						installmentError,
					);
					// Note: Order is still created even if installment generation fails
					// This allows manual intervention if needed
				}
			}

			// Automatically create approval chain for the order
			// This finds the matching workflow based on order amount and payment type,
			// then creates OrderApproval records for each approver in the workflow
			let approvalChain = null;
			try {
				orderLogger.info(
					`Creating approval chain for order ${order.id}: Total=${order.total}, PaymentType=${order.paymentType}`,
				);

				// Get employee name (TODO: fetch from Person/User database)
				const employeeName = "Employee Name"; // You should fetch this from your employee database

				// Prepare installments data for approval email (if available)
				const installmentsForApproval = generatedInstallments
					? generatedInstallments.map((inst: any) => ({
							id: inst.id,
							installmentNumber: inst.installmentNumber,
							amount: inst.amount,
							status: inst.status,
							scheduledDate: inst.scheduledDate,
							cutOffDate: inst.cutOffDate,
						}))
					: undefined;

				approvalChain = await createApprovalChain(
					prisma,
					order.id,
					order.orderNumber,
					order.employeeId,
					employeeName,
					order.total,
					order.paymentType,
					order.orderDate || new Date(),
					order.notes || undefined,
					installmentsForApproval,
				);

				if (approvalChain) {
					orderLogger.info(
						`✓ Successfully created approval chain for order ${order.id}: ` +
							`Workflow="${approvalChain.workflow.name}" (${approvalChain.workflow.id}), ` +
							`${approvalChain.approvals.length} approval level(s) created`,
					);

					// Log each approval level created
					approvalChain.approvals.forEach((approval: any) => {
						orderLogger.info(
							`  - Level ${approval.approvalLevel}: ${approval.approverRole} → ${approval.approverName} (${approval.approverEmail})`,
						);
					});
				} else {
					orderLogger.warn(
						`⚠ No approval workflow matched for order ${order.id}. ` +
							`Order total: ${order.total}, Payment type: ${order.paymentType}. ` +
							`Please ensure a workflow exists that matches these criteria.`,
					);
				}
			} catch (approvalError: any) {
				orderLogger.error(
					`✗ Failed to create approval chain for order ${order.id}:`,
					approvalError,
				);
				// Note: Order is still created even if approval chain creation fails
				// This allows manual intervention if needed
				// However, the order will remain in PENDING_APPROVAL status
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.ORDER.ACTIONS.CREATE_ORDER,
				description: `${config.ACTIVITY_LOG.ORDER.DESCRIPTIONS.ORDER_CREATED}: ${order.orderNumber || order.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.ORDER.PAGES.ORDER_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.ORDER,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.ORDER,
				entityId: order.id,
				changesBefore: null,
				changesAfter: {
					id: order.id,
					orderNumber: order.orderNumber,
					employeeId: order.employeeId,
					status: order.status,
					total: order.total,
					installmentMonths: order.installmentMonths,
					installmentCount: generatedInstallments?.length,
					createdAt: order.createdAt,
					updatedAt: order.updatedAt,
				},
				description: `${config.AUDIT_LOG.ORDER.DESCRIPTIONS.ORDER_CREATED}: ${order.orderNumber || order.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:order:list:*");
				orderLogger.info("Order list cache invalidated after creation");
			} catch (cacheError) {
				orderLogger.warn("Failed to invalidate cache after order creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.ORDER.CREATED,
				{
					order,
					orderItems: createdOrderItems.length > 0 ? createdOrderItems : undefined,
					transaction: transaction
						? {
								transactionNumber: transaction.transactionNumber,
								totalAmount: transaction.totalAmount,
								paidAmount: transaction.paidAmount,
								balance: transaction.balance,
								status: transaction.status,
							}
						: null,
					...(generatedInstallments && {
						installments: generatedInstallments,
						installmentSummary: {
							totalInstallments: generatedInstallments.length,
							installmentAmount: generatedInstallments[0]?.amount || 0,
							firstPayment: generatedInstallments[0]?.scheduledDate,
							lastPayment:
								generatedInstallments[generatedInstallments.length - 1]
									?.scheduledDate,
						},
					}),
					...(approvalChain && {
						approvalWorkflow: {
							workflowId: approvalChain.workflow.id,
							workflowName: approvalChain.workflow.name,
							totalLevels: approvalChain.approvals.length,
							currentLevel: 1,
							approvalChain: approvalChain.approvals.map((a: any) => ({
								approvalId: a.id,
								level: a.approvalLevel,
								role: a.approverRole,
								approverId: a.approverId,
								approverName: a.approverName,
								approverEmail: a.approverEmail,
								status: a.status,
							})),
						},
					}),
				},
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			orderLogger.error(`${config.ERROR.ORDER.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, orderLogger);

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

		orderLogger.info(
			`Getting orders, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.OrderWhereInput = {};

			// search fields for orders (orderNumber, employeeId, status, trackingNumber)
			const searchFields = ["orderNumber", "employeeId", "status", "trackingNumber", "notes"];
			if (query) {
				const searchConditions = buildSearchConditions("Order", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Order", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [orders, total] = await Promise.all([
				document ? prisma.order.findMany(findManyQuery) : [],
				count ? prisma.order.count({ where: whereClause }) : 0,
			]);

			// Normalize null items to empty array for backward compatibility
			const normalizedOrders = orders.map((order: any) => ({
				...order,
				items: order.items || [],
			}));

			orderLogger.info(`Retrieved ${orders.length} orders`);
			const processedData =
				groupBy && document
					? groupDataByField(normalizedOrders, groupBy as string)
					: normalizedOrders;

			const responseData: Record<string, any> = {
				...(document && { orders: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.ORDER.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			orderLogger.error(`${config.ERROR.ORDER.GET_ALL_FAILED}: ${error}`);
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
				orderLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				orderLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			orderLogger.info(`${config.SUCCESS.ORDER.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:order:byId:${id}:${fields || "full"}`;
			let order = null;

			try {
				if (redisClient.isClientConnected()) {
					order = await redisClient.getJSON(cacheKey);
					if (order) {
						orderLogger.info(`Order ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				orderLogger.warn(`Redis cache retrieval failed for order ${id}:`, cacheError);
			}

			if (!order) {
				const query: Prisma.OrderFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				order = await prisma.order.findFirst(query);

				if (order && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, order, 3600);
						orderLogger.info(`Order ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						orderLogger.warn(`Failed to store order ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!order) {
				orderLogger.error(`${config.ERROR.ORDER.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ORDER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Normalize null items to empty array for backward compatibility
			const normalizedOrder = {
				...order,
				items: (order as any).items || [],
			};

			orderLogger.info(`${config.SUCCESS.ORDER.RETRIEVED}: ${(order as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ORDER.RETRIEVED,
				normalizedOrder,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			orderLogger.error(`${config.ERROR.ORDER.ERROR_GETTING}: ${error}`);
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
				orderLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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

			const validationResult = UpdateOrderSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				orderLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				orderLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			orderLogger.info(`Updating order: ${id}`);

			const existingOrder = await prisma.order.findFirst({
				where: { id },
			});

			if (!existingOrder) {
				orderLogger.error(`${config.ERROR.ORDER.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ORDER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			// Handle stock restoration if order is being cancelled and was previously approved
			if (
				validatedData.status === "CANCELLED" &&
				(existingOrder.status === "APPROVED" || existingOrder.isFullyApproved)
			) {
				try {
					const { restoreStockForOrder } = await import("../../helper/stockService");
					await restoreStockForOrder(prisma, id);
					orderLogger.info(`Stock restored for cancelled order ${id}`);
				} catch (stockError) {
					orderLogger.error(
						`Failed to restore stock for cancelled order ${id}:`,
						stockError,
					);
					// Continue with order cancellation even if stock restoration fails
				}
			}

			const updatedOrder = await prisma.order.update({
				where: { id },
				data: prismaData as any,
			});

			try {
				await invalidateCache.byPattern(`cache:order:byId:${id}:*`);
				await invalidateCache.byPattern("cache:order:list:*");
				orderLogger.info(`Cache invalidated after order ${id} update`);
			} catch (cacheError) {
				orderLogger.warn("Failed to invalidate cache after order update:", cacheError);
			}

			orderLogger.info(`${config.SUCCESS.ORDER.UPDATED}: ${updatedOrder.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ORDER.UPDATED,
				{ order: updatedOrder },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			orderLogger.error(`${config.ERROR.ORDER.ERROR_UPDATING}: ${error}`);
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
				orderLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			orderLogger.info(`${config.SUCCESS.ORDER.DELETED}: ${id}`);

			const existingOrder = await prisma.order.findFirst({
				where: { id },
			});

			if (!existingOrder) {
				orderLogger.error(`${config.ERROR.ORDER.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ORDER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.order.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:order:byId:${id}:*`);
				await invalidateCache.byPattern("cache:order:list:*");
				orderLogger.info(`Cache invalidated after order ${id} deletion`);
			} catch (cacheError) {
				orderLogger.warn("Failed to invalidate cache after order deletion:", cacheError);
			}

			orderLogger.info(`${config.SUCCESS.ORDER.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.ORDER.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			orderLogger.error(`${config.ERROR.ORDER.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
