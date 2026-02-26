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
import {
	createTransactionForOrder,
	syncTransactionTotalFromInstallments,
} from "../../helper/transactionService";
import { createApprovalChain, findMatchingWorkflow } from "../../helper/approvalService";
import {
	getFinancierConfigForWorkflow,
	getRateForInstallmentCount,
} from "../../helper/financierHelper";
import { generateOrderNumber } from "../../helper/generate-OrderNumber.helper";
import { calculateOrderTotals } from "../../helper/calculateOrderTotals.helper";
import {
	createPurchaseOrdersForApprovedOrder,
	type PurchaseOrderFulfillmentPayload,
} from "../../helper/purchaseOrderService";
import {
	getOrderTrackingTimeline,
	computeOrderCurrentStage,
} from "../../helper/orderTrackingService";
import { createAdminDOForOrder } from "../../helper/deliveryDocumentService";

const logger = getLogger();
const orderLogger = logger.child({ module: "order" });

/** Include for order detail (orderItems, transaction, installments, workflow, approvals, delivery docs for readable status) */
const ORDER_DETAIL_INCLUDE = {
	orderItems: true,
	transaction: true,
	installments: { orderBy: { installmentNumber: "asc" as const } },
	financingAgreement: { select: { interestRate: true } },
	workflow: true,
	approvals: { orderBy: { approvalLevel: "asc" as const } },
	deliveryDocuments: {
		select: { id: true, documentType: true, transferStage: true, documentDate: true, documentNumber: true },
	},
	purchaseOrders: {
		select: {
			id: true,
			deliveryDocuments: {
				select: { id: true, documentType: true, transferStage: true, documentDate: true },
			},
		},
	},
} as const;

/**
 * Build the same response shape as create: order, orderItems, transaction,
 * installments, installmentSummary, approvalWorkflow.
 */
function buildOrderDetailResponse(order: any): Record<string, unknown> {
	const orderItems = order.orderItems ?? [];
	const transaction = order.transaction;
	const installments = order.installments ?? [];
	const financingAgreement = order.financingAgreement;
	const rateFromTransaction = transaction?.metadata?.breakdown?.rateFromFinancer ?? null;
	const workflow = order.workflow;
	const approvals = order.approvals ?? [];
	const principalAmount = Number(
		(Number(order?.subtotal ?? 0) - Number(order?.discount ?? 0)).toFixed(2),
	);
	const netPrincipalTotal = Number((principalAmount - Number(order?.pointsUsed ?? 0)).toFixed(2));

	const { currentStage, currentStageLabel } = computeOrderCurrentStage(order);
	const response: Record<string, unknown> = {
		order: {
			...order,
			orderItems: undefined,
			transaction: undefined,
			installments: undefined,
			financingAgreement: undefined,
			totalPayable: undefined,
			installmentRate: undefined,
			installmentRateFromFinancier:
				financingAgreement?.interestRate ?? rateFromTransaction ?? null,
			principalAmount,
			workflow: undefined,
			approvals: undefined,
			deliveryDocuments: undefined,
			purchaseOrders: undefined,
			currentStage,
			readableStatus: currentStageLabel,
		},
		orderItems: orderItems.length > 0 ? orderItems : undefined,
		transaction: transaction
			? {
					transactionNumber: transaction.transactionNumber,
					totalAmount: transaction.totalAmount,
					paidAmount: transaction.paidAmount,
					balance: transaction.balance,
					status: transaction.status,
					rateFromFinancier:
						transaction?.metadata?.breakdown?.rateFromFinancer ??
						financingAgreement?.interestRate ??
						null,
					breakdown: {
						price: transaction?.metadata?.breakdown?.price ?? order?.subtotal ?? null,
						principalAmount,
						interestAmount:
							transaction?.totalAmount != null
								? Number(
										(
											Number(transaction.totalAmount) -
											Number(netPrincipalTotal)
										).toFixed(2),
									)
								: null,
					},
				}
			: null,
	};
	if (installments.length > 0) {
		(response as any).installments = installments;
		(response as any).installmentSummary = {
			totalInstallments: installments.length,
			installmentAmount: installments[0]?.amount ?? 0,
			firstPayment: installments[0]?.scheduledDate ?? null,
			lastPayment: installments[installments.length - 1]?.scheduledDate ?? null,
		};
	}
	if (workflow && approvals.length > 0) {
		(response as any).approvalWorkflow = {
			workflowId: workflow.id,
			workflowName: workflow.name,
			totalLevels: approvals.length,
			currentLevel: order.currentApprovalLevel ?? 1,
			approvalChain: approvals.map((a: any) => ({
				approvalId: a.id,
				level: a.approvalLevel,
				role: a.approverRole,
				approverId: a.approverId,
				approverName: a.approverName,
				approverEmail: a.approverEmail,
				status: a.status,
			})),
		};
	}
	return response;
}

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
			// Calculate order totals from items (needed for workflow check and order data)
			const totals = await calculateOrderTotals(prisma, validation.data.items);

			// Validate item availability and stock (same rules as cart checkout)
			const itemIds = [...new Set(totals.items.map((i) => i.itemId))];
			const dbItems = await prisma.item.findMany({
				where: { id: { in: itemIds } },
				select: {
					id: true,
					name: true,
					status: true,
					isAvailable: true,
					isActive: true,
					stockQuantity: true,
				},
			});
			const itemMap = new Map(dbItems.map((i) => [i.id, i]));
			const unavailableItems: Array<{ itemId: string; itemName: string; reasons: string[] }> =
				[];
			for (const row of totals.items) {
				const item = itemMap.get(row.itemId);
				if (!item) {
					unavailableItems.push({
						itemId: row.itemId,
						itemName: "Unknown",
						reasons: ["Item not found"],
					});
					continue;
				}
				const reasons: string[] = [];
				if (item.status !== "APPROVED") {
					reasons.push(`Status is ${item.status} (must be APPROVED)`);
				}
				if (!item.isAvailable) reasons.push("Item is not available");
				if (!item.isActive) reasons.push("Item is inactive");
				if (item.stockQuantity < row.quantity) {
					reasons.push(
						`Insufficient stock: available ${item.stockQuantity}, requested ${row.quantity}`,
					);
				}
				if (reasons.length > 0) {
					unavailableItems.push({
						itemId: item.id,
						itemName: item.name || "Unknown",
						reasons,
					});
				}
			}
			if (unavailableItems.length > 0) {
				orderLogger.warn(
					`Order creation rejected: unavailable or out-of-stock items: ${JSON.stringify(unavailableItems)}`,
				);
				const errorMessages = unavailableItems.flatMap((u) =>
					u.reasons.map((r) => ({
						field: `item.${u.itemId}`,
						message: `${u.itemName}: ${r}`,
					})),
				);
				res.status(400).json(
					buildErrorResponse(
						"One or more items are not available or out of stock. Please remove them and try again.",
						400,
						errorMessages,
					),
				);
				return;
			}

			// Require a matching approval workflow before creating the order
			const paymentType = validation.data.paymentType ?? "INSTALLMENT";
			const matchingWorkflow = await findMatchingWorkflow(prisma, totals.total, paymentType);
			if (!matchingWorkflow) {
				orderLogger.warn(
					`Order creation rejected: no approval workflow for total=${totals.total}, paymentType=${paymentType}`,
				);
				res.status(400).json(
					buildErrorResponse(
						"No approval workflow is configured for this order amount and payment type. Please contact your administrator or choose different options.",
						400,
					),
				);
				return;
			}

			// Generate order number automatically
			const orderNumber = await generateOrderNumber(prisma);

			// Compute final order total before saving:
			// - principalTotal comes from base pricing (subtotal/discount)
			// - for INSTALLMENT, apply financier rate so persisted `total` is payable total
			const principalTotal = totals.total;
			let finalTotal = principalTotal;
			let installmentRateFromFinancier: number | null = null;
			if (paymentType === "INSTALLMENT") {
				const requestedMonths = validation.data.installmentMonths || 6;
				const installmentCount = requestedMonths * 2;
				let interestRatePercent = 0;
				try {
					const financierConfig = await getFinancierConfigForWorkflow(
						prisma,
						matchingWorkflow,
					);
					if (financierConfig) {
						interestRatePercent = getRateForInstallmentCount(
							installmentCount,
							financierConfig,
						);
						orderLogger.info(
							`Using financier rate for order pre-save total: ${interestRatePercent}% for ${installmentCount} installments`,
						);
					}
				} catch (rateError) {
					orderLogger.warn(
						`Could not resolve financier rate for pre-save total (using 0%):`,
						rateError,
					);
				}
				installmentRateFromFinancier = interestRatePercent > 0 ? interestRatePercent : null;
				if (interestRatePercent > 0) {
					finalTotal = Number(
						(principalTotal + (principalTotal * interestRatePercent) / 100).toFixed(2),
					);
				}
			}

			// Prepare order data (order items are stored in OrderItem collection)
			const { userId, items: _items, ...restValidation } = validation.data;
			const orderData = {
				...restValidation,
				userId,
				orderNumber,
				subtotal: totals.subtotal,
				discount: totals.discount,
				tax: 0,
				total: finalTotal,
			};

			// Create the order first
			const order = await prisma.order.create({
				data: {
					...orderData,
					organizationId: (req as any).organizationId || orderData.organizationId,
				} as any,
			});
			orderLogger.info(`Order created successfully: ${order.id}`);

			// Create OrderItem records for each item
			let createdOrderItems = [];
			try {
				for (const item of totals.items) {
					const orderItem = await prisma.orderItem.create({
						data: {
							orderId: order.id,
							itemId: item.itemId,
							quantity: item.quantity,
							unitPrice: item.unitPrice,
							discount: item.discount,
							subtotal: item.subtotal,
							organizationId: (req as any).organizationId || order.organizationId,
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
					order.userId,
					order.total,
					order.paymentType,
					order.paymentMethod,
					(order as any).userType,
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

				// Interest has already been applied to order.total before save.
				// Generate installments from payable total with no extra interest pass.
				const interestRatePercent = installmentRateFromFinancier ?? 0;

				try {
					orderLogger.info(
						`Generating installments for order ${order.id}: ${installmentMonths} months` +
							(interestRatePercent > 0 ? `, rate ${interestRatePercent}%` : ""),
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
					// Reflect financier rate (total payable) in transaction ledger
					await syncTransactionTotalFromInstallments(prisma, order.id, {
						rateFromFinancer: interestRatePercent,
						price: order.subtotal,
					});
					// Re-fetch transaction so response reflects synced total and rate breakdown
					transaction = await prisma.transaction.findFirst({
						where: { orderId: order.id },
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
					order.userId,
					employeeName,
					order.total,
					order.paymentType,
					order.orderDate || new Date(),
					order.notes || undefined,
					installmentsForApproval,
					(req as any).io,
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
					userId: order.userId,
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
					order: {
						...order,
						totalPayable: undefined,
						installmentRate: undefined,
						installmentRateFromFinancier:
							installmentRateFromFinancier ??
							(transaction as any)?.metadata?.breakdown?.rateFromFinancer ??
							null,
						principalAmount: Number(
							(Number(order.subtotal ?? 0) - Number(order.discount ?? 0)).toFixed(2),
						),
					},
					orderItems: createdOrderItems.length > 0 ? createdOrderItems : undefined,
					transaction: transaction
						? {
								transactionNumber: transaction.transactionNumber,
								totalAmount: transaction.totalAmount,
								paidAmount: transaction.paidAmount,
								balance: transaction.balance,
								status: transaction.status,
								rateFromFinancier:
									(transaction as any)?.metadata?.breakdown?.rateFromFinancer ??
									null,
								breakdown: {
									price:
										(transaction as any)?.metadata?.breakdown?.price ??
										order.subtotal ??
										null,
									principalAmount: Number(
										(
											Number(order.subtotal ?? 0) -
											Number(order.discount ?? 0)
										).toFixed(2),
									),
									interestAmount: Number(
										(
											Number(transaction.totalAmount) -
											Number(
												(
													Number(order.subtotal ?? 0) -
													Number(order.discount ?? 0) +
													Number(order.pointsUsed ?? 0)
												).toFixed(2),
											)
										).toFixed(2),
									),
								},
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

			// search fields for orders (orderNumber, userId, status, trackingNumber)
			const searchFields = ["orderNumber", "userId", "status", "trackingNumber", "notes"];
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

			// When returning documents, use full detail include (orderItems, transaction, installments, approvals) for same shape as create/getById
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);
			const useDetailInclude = document && !fields;

			const [orders, total] = await Promise.all([
				document
					? useDetailInclude
						? prisma.order.findMany({
								where: whereClause,
								skip,
								take: limit,
								orderBy: findManyQuery.orderBy,
								include: ORDER_DETAIL_INCLUDE,
							})
						: prisma.order.findMany(findManyQuery)
					: [],
				count ? prisma.order.count({ where: whereClause }) : 0,
			]);

			// Same shape as create/getById: order, orderItems, transaction, installments, installmentSummary, approvalWorkflow
			const normalizedOrders = useDetailInclude
				? (orders as any[]).map((o) => buildOrderDetailResponse(o))
				: (orders as any[]);

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

			const cacheKey = `cache:order:byId:${id}:${fields || "detail"}`;
			let order: any = null;

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
				order = fields
					? await prisma.order.findFirst({
							where: { id },
							select: getNestedFields(fields),
						})
					: await prisma.order.findFirst({
							where: { id },
							include: ORDER_DETAIL_INCLUDE,
						});

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

			// Return same shape as create: order, orderItems, transaction, installments, installmentSummary, approvalWorkflow
			const responseData = fields ? { ...order } : buildOrderDetailResponse(order);

			orderLogger.info(`${config.SUCCESS.ORDER.RETRIEVED}: ${order.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ORDER.RETRIEVED,
				responseData,
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

	const getTracking = async (req: Request, res: Response, _next: NextFunction) => {
		const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		if (!id) {
			res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
			return;
		}
		try {
			const timeline = await getOrderTrackingTimeline(prisma, id);
			if (!timeline.orderNumber) {
				res.status(404).json(buildErrorResponse(config.ERROR.ORDER.NOT_FOUND, 404));
				return;
			}
			res.status(200).json(
				buildSuccessResponse("Order tracking retrieved", {
					orderId: timeline.orderId,
					orderNumber: timeline.orderNumber,
					status: timeline.status,
					currentStage: timeline.currentStage,
					currentStageLabel: timeline.currentStageLabel,
					tracking: timeline.tracking,
				}),
			);
		} catch (error) {
			orderLogger.error(`Get order tracking failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	/**
	 * Create purchase order(s) for an already-approved order (e.g. orders created from cart
	 * that only had embedded items and did not get POs at approval time).
	 */
	const createPurchaseOrders = async (req: Request, res: Response, _next: NextFunction) => {
		const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		if (!id) {
			res.status(400).json(buildErrorResponse("Order ID is required", 400));
			return;
		}
		try {
			const order = await prisma.order.findUnique({
				where: { id },
				select: {
					id: true,
					orderNumber: true,
					status: true,
					isFullyApproved: true,
					purchaseOrders: { select: { id: true } },
				},
			});
			if (!order) {
				res.status(404).json(buildErrorResponse(config.ERROR.ORDER.NOT_FOUND, 404));
				return;
			}
			if (order.status !== "APPROVED") {
				res.status(400).json(
					buildErrorResponse(
						"Only approved orders can have purchase orders created. Current status: " +
							order.status,
						400,
					),
				);
				return;
			}
			if (!order.isFullyApproved) {
				res.status(400).json(
					buildErrorResponse(
						"Order is not fully approved. Complete all required approvals before generating purchase orders.",
						400,
					),
				);
				return;
			}
			if (order.purchaseOrders.length > 0) {
				res.status(400).json(
					buildErrorResponse(
						"Order already has purchase order(s). No duplicate POs created.",
						400,
					),
				);
				return;
			}
			const approvedBy = (req as any).user?.id;
			const body = req.body ?? {};
			const contactPayload = {
				contactName: body.contactName ?? null,
				contactDesignation: body.contactDesignation ?? null,
				contactDepartment: body.contactDepartment ?? null,
				contactNumber: body.contactNumber ?? null,
				contactMobile: body.contactMobile ?? null,
				contactEmail: body.contactEmail ?? null,
			};
			const rawLeadTime = body.leadTime != null ? Number(body.leadTime) : null;
			const fulfillmentPayload: PurchaseOrderFulfillmentPayload = {
				leadTime: rawLeadTime != null && !Number.isNaN(rawLeadTime) ? rawLeadTime : null,
				availability: body.availability ?? null,
				delivery: body.delivery ?? null,
				pdc: body.pdc ?? null,
			};
			const pos = await createPurchaseOrdersForApprovedOrder(
				prisma,
				id,
				approvedBy,
				contactPayload,
				fulfillmentPayload,
			);
			// Re-fetch full PurchaseOrder objects with related order & supplier info
			const fullPOs =
				pos.length > 0
					? await prisma.purchaseOrder.findMany({
							where: { id: { in: pos.map((p) => p.id) } },
							include: {
								order: { select: { id: true, orderNumber: true } },
								supplier: { select: { id: true, name: true, code: true } },
							},
						})
					: [];
			try {
				await invalidateCache.byPattern(`cache:order:byId:${id}:*`);
				await invalidateCache.byPattern("cache:order:list:*");
				await invalidateCache.byPattern("cache:purchaseOrder:list:*");
			} catch (e) {
				orderLogger.warn("Cache invalidation failed after creating POs:", e);
			}
			res.status(201).json(
				buildSuccessResponse(
					`Created ${pos.length} purchase order(s) for order ${order.orderNumber}`,
					{ purchaseOrders: fullPOs, count: pos.length },
					201,
				),
			);
		} catch (error: any) {
			orderLogger.error(`Create purchase orders for order failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(error.message || config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	/**
	 * Dispatch an approved order to the client: creates an Admin DO (ADMIN_TO_CLIENT).
	 * POST /order/:id/dispatch
	 * Body (optional): { trackingNumber?, expectedDeliveryDate?, expectedDeliveryTime?,
	 *   internalDeliveryPersonnel?, carrierInfo?, toName?, toAddress?, clientUserId? }
	 */
	const dispatch = async (req: Request, res: Response, _next: NextFunction) => {
		const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		if (!id) {
			res.status(400).json(buildErrorResponse("Order ID is required", 400));
			return;
		}
		try {
			const order = await prisma.order.findUnique({
				where: { id },
				select: { id: true, orderNumber: true, status: true, isFullyApproved: true },
			});
			if (!order) {
				res.status(404).json(buildErrorResponse(config.ERROR.ORDER.NOT_FOUND, 404));
				return;
			}
			if (!["APPROVED", "PROCESSING"].includes(order.status)) {
				res.status(400).json(
					buildErrorResponse(
						`Order must be APPROVED or PROCESSING to dispatch. Current status: ${order.status}`,
						400,
					),
				);
				return;
			}
			const body = req.body ?? {};
			const result = await createAdminDOForOrder(prisma, id, {
				trackingNumber: body.trackingNumber ?? null,
				expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null,
				expectedDeliveryTime: body.expectedDeliveryTime ?? null,
				internalDeliveryPersonnel: body.internalDeliveryPersonnel ?? null,
				carrierInfo: body.carrierInfo ?? null,
				toName: body.toName ?? null,
				toAddress: body.toAddress ?? null,
				clientUserId: body.clientUserId ?? null,
			});
			if (!result) {
				res.status(500).json(buildErrorResponse("Failed to create Admin delivery order", 500));
				return;
			}
			try {
				const { syncOrderStatusFromDeliveryDocuments } = await import("../../helper/orderTrackingService");
				const synced = await syncOrderStatusFromDeliveryDocuments(prisma, id);
				if (synced.updated) {
					await invalidateCache.byPattern(`cache:order:byId:${id}:*`);
					await invalidateCache.byPattern("cache:order:list:*");
				}
			} catch (syncErr) {
				orderLogger.warn("Order status sync after dispatch failed:", syncErr);
			}
			orderLogger.info(`Order ${order.orderNumber} dispatched: Admin DO ${result.documentNumber}`);
			res.status(201).json(
				buildSuccessResponse(
					`Order ${order.orderNumber} dispatched to client`,
					{
						deliveryOrder: result.deliveryOrder,
						documentNumber: result.documentNumber,
					},
					201,
				),
			);
		} catch (error: any) {
			orderLogger.error(`Dispatch order failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(error.message || config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	return { create, getAll, getById, getTracking, update, remove, createPurchaseOrders, dispatch };
};
