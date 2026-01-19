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
import { generateInstallments } from "../../helper/installmentService";
import { createTransactionForOrder } from "../../helper/transactionService";
import { createApprovalChain } from "../../helper/approvalService";
import { generateOrderNumber } from "../../helper/generate-OrderNumber.helper";
import { z } from "zod";

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
			const { employeeId, productId, quantity = 1 } = validation.data;

			// Ensure quantity is at least 1
			const quantityToAdd = quantity || 1;

			// Check if cart item already exists for this employee and product
			const existingCartItem = await prisma.cartItem.findFirst({
				where: {
					employeeId: employeeId,
					productId: productId,
				},
			});

			let cartItem;
			let isUpdate = false;

			if (existingCartItem) {
				// Update quantity by adding the new quantity to existing quantity
				const newQuantity = existingCartItem.quantity + quantityToAdd;
				cartItem = await prisma.cartItem.update({
					where: {
						id: existingCartItem.id,
					},
					data: {
						quantity: newQuantity,
					},
				});
				isUpdate = true;
				cartItemLogger.info(
					`CartItem updated: ${cartItem.id}, quantity increased from ${existingCartItem.quantity} to ${newQuantity}`,
				);
			} else {
				// Create new cart item with quantity (default to 1 if not provided)
				cartItem = await prisma.cartItem.create({
					data: {
						employeeId: employeeId,
						productId: productId,
						quantity: quantityToAdd,
					} as any,
				});
				cartItemLogger.info(`CartItem created successfully: ${cartItem.id}`);
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: isUpdate
					? config.ACTIVITY_LOG.CARTITEM.ACTIONS.UPDATE_CARTITEM
					: config.ACTIVITY_LOG.CARTITEM.ACTIONS.CREATE_CARTITEM,
				description: isUpdate
					? `${config.ACTIVITY_LOG.CARTITEM.DESCRIPTIONS.CARTITEM_UPDATED}: ${cartItem.id}`
					: `${config.ACTIVITY_LOG.CARTITEM.DESCRIPTIONS.CARTITEM_CREATED}: ${cartItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.CARTITEM.PAGES.CARTITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: isUpdate ? config.AUDIT_LOG.ACTIONS.UPDATE : config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.CARTITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.CARTITEM,
				entityId: cartItem.id,
				changesBefore: isUpdate
					? {
							id: existingCartItem!.id,
							employeeId: existingCartItem!.employeeId,
							productId: existingCartItem!.productId,
							quantity: existingCartItem!.quantity,
						}
					: null,
				changesAfter: {
					id: cartItem.id,
					employeeId: cartItem.employeeId,
					productId: cartItem.productId,
					quantity: cartItem.quantity,
					createdAt: cartItem.createdAt,
					updatedAt: cartItem.updatedAt,
				},
				description: isUpdate
					? `${config.AUDIT_LOG.CARTITEM.DESCRIPTIONS.CARTITEM_UPDATED}: ${cartItem.id}`
					: `${config.AUDIT_LOG.CARTITEM.DESCRIPTIONS.CARTITEM_CREATED}: ${cartItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:cartItem:list:*");
				cartItemLogger.info("CartItem list cache invalidated after creation/update");
			} catch (cacheError) {
				cartItemLogger.warn(
					"Failed to invalidate cache after cartItem creation/update:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				isUpdate ? "Cart item quantity updated successfully" : config.SUCCESS.CARTITEM.CREATED,
				{
					...cartItem,
					action: isUpdate ? "updated" : "created",
					previousQuantity: isUpdate ? existingCartItem!.quantity : null,
				},
				isUpdate ? 200 : 201,
			);
			res.status(isUpdate ? 200 : 201).json(successResponse);
		} catch (error: any) {
			cartItemLogger.error(`${config.ERROR.CARTITEM.CREATE_FAILED}: ${error}`);
			
			// Handle unique constraint error specifically
			if (error.code === "P2002" && error.meta?.target?.includes("employeeId_productId")) {
				// This shouldn't happen now, but handle it gracefully
				cartItemLogger.warn(
					`Duplicate cart item detected for employee ${validation.data.employeeId} and product ${validation.data.productId}, attempting update`,
				);
				const errorResponse = buildErrorResponse(
					"This product is already in your cart. Quantity will be updated.",
					409,
					[
						{
							field: "productId",
							message: "Product already exists in cart",
						},
					],
				);
				res.status(409).json(errorResponse);
				return;
			}

			const errorResponse = buildErrorResponse(
				error.message || config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
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

	const checkout = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			cartItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			requestData = convertStringNumbers(requestData);
			cartItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		// Validate checkout request
		const CheckoutSchema = z.object({
			employeeId: z.string().min(1, "Employee ID is required"),
			paymentType: z.enum(["CASH", "INSTALLMENT", "POINTS", "MIXED"]).default("INSTALLMENT"),
			installmentMonths: z.number().int().min(1).optional().nullable(),
			paymentMethod: z
				.enum([
					"PAYROLL_DEDUCTION",
					"CASH",
					"CREDIT_CARD",
					"DEBIT_CARD",
					"BANK_TRANSFER",
					"OTHER",
				])
				.default("PAYROLL_DEDUCTION"),
			discount: z.number().min(0).default(0),
			tax: z.number().min(0).default(0),
			pointsUsed: z.number().min(0).optional().nullable(),
			notes: z.string().optional().nullable(),
		});

		const validation = CheckoutSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			cartItemLogger.error(`Checkout validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		const {
			employeeId,
			paymentType,
			installmentMonths,
			paymentMethod,
			discount,
			tax,
			pointsUsed,
			notes,
		} = validation.data;

		// Validate installment months if payment type is INSTALLMENT
		if (paymentType === "INSTALLMENT" && !installmentMonths) {
			cartItemLogger.error("Installment months required for INSTALLMENT payment type");
			const errorResponse = buildErrorResponse(
				"installmentMonths is required when paymentType is INSTALLMENT",
				400,
				[{ field: "installmentMonths", message: "Installment months is required" }],
			);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Get all cart items for the employee (without product relation to avoid null errors)
			const allCartItems = await prisma.cartItem.findMany({
				where: { employeeId },
			});

			if (allCartItems.length === 0) {
				cartItemLogger.error(`No cart items found for employee ${employeeId}`);
				const errorResponse = buildErrorResponse("Cart is empty", 400, [
					{ field: "cart", message: "Cannot checkout with an empty cart" },
				]);
				res.status(400).json(errorResponse);
				return;
			}

			// Get all product IDs from cart items
			const productIds = [...new Set(allCartItems.map((item) => item.productId))];

			// Fetch products separately to handle missing products gracefully
			const products = await prisma.product.findMany({
				where: {
					id: { in: productIds },
				},
			});

			// Create a map of products by ID for quick lookup
			const productMap = new Map(products.map((p) => [p.id, p]));

			// Separate valid and invalid cart items
			const validCartItems: Array<{
				cartItem: (typeof allCartItems)[0];
				product: (typeof products)[0];
			}> = [];
			const invalidCartItemIds: string[] = [];

			for (const cartItem of allCartItems) {
				const product = productMap.get(cartItem.productId);
				if (product) {
					validCartItems.push({ cartItem, product });
				} else {
					invalidCartItemIds.push(cartItem.id);
				}
			}

			// Remove invalid cart items from database
			if (invalidCartItemIds.length > 0) {
				cartItemLogger.warn(
					`Found ${invalidCartItemIds.length} cart items with missing products for employee ${employeeId}`,
				);
				try {
					await prisma.cartItem.deleteMany({
						where: {
							id: { in: invalidCartItemIds },
						},
					});
					cartItemLogger.info(
						`Removed ${invalidCartItemIds.length} invalid cart items from database`,
					);
				} catch (deleteError) {
					cartItemLogger.error(`Failed to remove invalid cart items: ${deleteError}`);
				}
			}

			// Check if there are any valid cart items after filtering
			if (validCartItems.length === 0) {
				cartItemLogger.error(
					`No valid cart items found for employee ${employeeId} (all products are missing)`,
				);
				const errorResponse = buildErrorResponse(
					"Cart contains invalid items. Please remove items with unavailable products and try again.",
					400,
					[
						{
							field: "cart",
							message: "All cart items reference products that no longer exist",
						},
					],
				);
				res.status(400).json(errorResponse);
				return;
			}

			// Calculate order totals
			let subtotal = 0;
			const orderItemsData: any[] = [];
			const unavailableProducts: Array<{
				productId: string;
				productName: string;
				reasons: string[];
			}> = [];

			for (const { cartItem, product } of validCartItems) {
				// Check if product is available and approved
				const reasons: string[] = [];
				if (product.status !== "APPROVED") {
					reasons.push(`Status is ${product.status} (must be APPROVED)`);
				}
				if (!product.isAvailable) {
					reasons.push("Product is marked as not available");
				}
				if (!product.isActive) {
					reasons.push("Product is inactive");
				}
				// Check stock availability
				if (product.stockQuantity < cartItem.quantity) {
					reasons.push(
						`Insufficient stock: Available ${product.stockQuantity}, Requested ${cartItem.quantity}`,
					);
				}

				if (reasons.length > 0) {
					unavailableProducts.push({
						productId: product.id,
						productName: product.name || "Unknown",
						reasons,
					});
					cartItemLogger.warn(
						`Product ${product.id} (${product.name}) is not available for checkout: ${reasons.join(", ")}`,
					);
					continue;
				}

				// Use employeePrice if available, otherwise retailPrice
				const unitPrice = product.employeePrice || product.retailPrice;
				const itemSubtotal = unitPrice * cartItem.quantity;
				subtotal += itemSubtotal;

				orderItemsData.push({
					productId: product.id,
					quantity: cartItem.quantity,
					unitPrice: unitPrice,
					discount: 0,
					subtotal: itemSubtotal,
				});
			}

			// Check if we have any valid order items after filtering
			if (orderItemsData.length === 0) {
				cartItemLogger.error(
					`No valid order items after filtering for employee ${employeeId}`,
				);
				const errorMessages: Array<{ field: string; message: string }> = [
					{
						field: "cart",
						message: "No available products in cart for checkout",
					},
				];

				// Add detailed information about unavailable products
				if (unavailableProducts.length > 0) {
					unavailableProducts.forEach((unavailable) => {
						errorMessages.push({
							field: `product.${unavailable.productId}`,
							message: `${unavailable.productName}: ${unavailable.reasons.join(", ")}`,
						});
					});
				}

				const errorResponse = buildErrorResponse(
					"Cart contains items that are not available for purchase. Please remove unavailable items and try again.",
					400,
					errorMessages,
				);
				res.status(400).json(errorResponse);
				return;
			}

			// No shipping cost for company internal delivery
			const total = subtotal - discount + tax - (pointsUsed || 0);

			if (total <= 0) {
				cartItemLogger.error(`Invalid order total: ${total}`);
				const errorResponse = buildErrorResponse("Invalid order total", 400, [
					{ field: "total", message: "Order total must be greater than 0" },
				]);
				res.status(400).json(errorResponse);
				return;
			}

			// Generate order number using helper function
			const orderNumber = await generateOrderNumber(prisma);

			// Create order with embedded items array (no shipping for company internal delivery)
			const order = await prisma.order.create({
				data: {
					orderNumber,
					employeeId,
					subtotal,
					discount,
					tax,
					total,
					paymentType,
					installmentMonths: paymentType === "INSTALLMENT" ? installmentMonths : null,
					paymentMethod,
					pointsUsed: pointsUsed || null,
					notes: notes || null,
					orderDate: new Date(),
					items: orderItemsData, // Embedded items array
				} as any,
			});

			cartItemLogger.info(`Order created successfully from cart: ${order.id}`);

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
				cartItemLogger.info(`Transaction ledger created for order ${order.id}`);
			} catch (transactionError) {
				cartItemLogger.error(
					`Failed to create transaction for order ${order.id}:`,
					transactionError,
				);
			}

			// Automatically generate installments if payment type is INSTALLMENT
			let generatedInstallments = null;
			if (order.paymentType === "INSTALLMENT" && order.installmentMonths) {
				try {
					cartItemLogger.info(
						`Generating installments for order ${order.id}: ${order.installmentMonths} months`,
					);

					generatedInstallments = await generateInstallments(
						prisma,
						order.id,
						order.installmentMonths,
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

					cartItemLogger.info(
						`Successfully generated ${generatedInstallments.length} installments for order ${order.id}`,
					);
				} catch (installmentError) {
					cartItemLogger.error(
						`Failed to generate installments for order ${order.id}:`,
						installmentError,
					);
				}
			}

			// Automatically create approval chain for the order
			let approvalChain = null;
			try {
				cartItemLogger.info(
					`Creating approval chain for order ${order.id}: Total=${order.total}, PaymentType=${order.paymentType}`,
				);

				// Get employee name (TODO: fetch from Person/User database)
				const employeeName = "Employee Name"; // You should fetch this from your employee database

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
					generatedInstallments || undefined,
				);

				if (approvalChain) {
					cartItemLogger.info(
						`Successfully created approval chain for order ${order.id}: ` +
							`Workflow=${approvalChain.workflow.name}, Levels=${approvalChain.approvals.length}`,
					);
				} else {
					cartItemLogger.warn(`No approval workflow matched for order ${order.id}`);
				}
			} catch (approvalError) {
				cartItemLogger.error(
					`Failed to create approval chain for order ${order.id}:`,
					approvalError,
				);
			}

			// Clear cart items after successful order creation (only valid ones that were used)
			try {
				const productIdsUsed = new Set(orderItemsData.map((item) => item.productId));
				const cartItemIdsToDelete = validCartItems
					.filter(({ product }) => productIdsUsed.has(product.id))
					.map(({ cartItem }) => cartItem.id);

				if (cartItemIdsToDelete.length > 0) {
					await prisma.cartItem.deleteMany({
						where: {
							id: { in: cartItemIdsToDelete },
						},
					});
					cartItemLogger.info(
						`Cleared ${cartItemIdsToDelete.length} cart items for employee ${employeeId}`,
					);
				}
			} catch (clearCartError) {
				cartItemLogger.error(
					`Failed to clear cart items for employee ${employeeId}:`,
					clearCartError,
				);
				// Don't fail the checkout if cart clearing fails
			}

			// Invalidate caches
			try {
				await invalidateCache.byPattern("cache:cartItem:list:*");
				await invalidateCache.byPattern("cache:order:list:*");
				cartItemLogger.info("Cache invalidated after checkout");
			} catch (cacheError) {
				cartItemLogger.warn("Failed to invalidate cache after checkout:", cacheError);
			}

			// Log activity and audit
			logActivity(req, {
				userId: (req as any).user?.id || employeeId,
				action: config.ACTIVITY_LOG.ORDER.ACTIONS.CREATE_ORDER,
				description: `Order created from cart: ${order.orderNumber || order.id}`,
				page: {
					url: req.originalUrl,
					title: "Cart Checkout",
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || employeeId,
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
				description: `Order created from cart: ${order.orderNumber || order.id}`,
			});

			// Fetch order (items are now embedded as JSON)
			const orderWithItems = await prisma.order.findUnique({
				where: { id: order.id },
			});

			// Fetch product details for each item in the embedded items array
			const items = (orderWithItems?.items as any) || [];
			const itemsWithProducts = await Promise.all(
				items.map(async (item: any) => {
					const product = await prisma.product.findUnique({
						where: { id: item.productId },
						select: {
							id: true,
							name: true,
							sku: true,
							imageUrl: true,
						},
					});
					return {
						...item,
						product,
					};
				})
			);

			// Calculate total quantity of products
			const totalQuantity = orderItemsData.reduce((sum, item) => sum + item.quantity, 0);
			const totalProducts = orderItemsData.length;

			// Prepare product summary
			const productsSummary = orderItemsData.map((item) => {
				const product = validCartItems.find(
					({ product: p }) => p.id === item.productId,
				)?.product;
				return {
					productId: item.productId,
					productName: product?.name || "Unknown Product",
					productSku: product?.sku || "N/A",
					quantity: item.quantity,
					unitPrice: item.unitPrice,
					subtotal: item.subtotal,
				};
			});

			const successResponse = buildSuccessResponse(
				"Order created successfully from cart",
				{
					order: orderWithItems ? {
						...orderWithItems,
						items: itemsWithProducts,
					} : order,
					checkoutSummary: {
						totalProducts: totalProducts,
						totalQuantity: totalQuantity,
						products: productsSummary,
						cartItemsProcessed: validCartItems.length,
						cartItemsRemoved: invalidCartItemIds.length,
					},
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
							name: approvalChain.workflow.name,
							totalLevels: approvalChain.approvals.length,
							currentLevel: 1,
							approvalChain: approvalChain.approvals.map((a) => ({
								level: a.approvalLevel,
								role: a.approverRole,
								approverName: a.approverName,
								status: a.status,
							})),
						},
					}),
				},
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			cartItemLogger.error(`Checkout failed: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove, checkout };
};
