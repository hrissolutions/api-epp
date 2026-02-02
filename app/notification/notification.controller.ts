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
import { CreateNotificationSchema, UpdateNotificationSchema } from "../../zod/notification.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { isValidObjectId } from "mongoose";
import { runBookingDropoffReminder } from "../../helper/booking-reminder";

const logger = getLogger();
const notificationLogger = logger.child({ module: "notification" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			notificationLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			notificationLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateNotificationSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			notificationLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const { source, category, title, description, metadata, isDeleted } =
				validation.data as any;
			const createData: Prisma.NotificationCreateInput = {
				source,
				category: category || "general",
				title,
				description,
				metadata,
				isDeleted,
			};
			const notification = await prisma.notification.create({
				data: {
					...createData,
					organizationId: (req as any).organizationId || createData.organizationId,
				} as any,
			});
			notificationLogger.info(`Notification created successfully: ${notification.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.NOTIFICATION.ACTIONS.CREATE_NOTIFICATION,
				description: `${config.ACTIVITY_LOG.NOTIFICATION.DESCRIPTIONS.NOTIFICATION_CREATED}: ${notification.title || notification.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.NOTIFICATION.PAGES.NOTIFICATION_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.NOTIFICATION,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.NOTIFICATION,
				entityId: notification.id,
				changesBefore: null,
				changesAfter: {
					id: notification.id,
					title: (notification as any).title,
					description: notification.description,
					createdAt: notification.createdAt,
					updatedAt: notification.updatedAt,
				},
				description: `${config.AUDIT_LOG.NOTIFICATION.DESCRIPTIONS.NOTIFICATION_CREATED}: ${notification.title || notification.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:notification:list:*");
				notificationLogger.info("Notification list cache invalidated after creation");
			} catch (cacheError) {
				notificationLogger.warn(
					"Failed to invalidate cache after notification creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.CREATED,
				notification,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.CREATE_FAILED}: ${error}`);
			// Handle Prisma errors
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				typeof (error as any).code === "string"
			) {
				const errorResponse = buildErrorResponse("Database operation failed", 400);
				res.status(400).json(errorResponse);
				return;
			}
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, notificationLogger);

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

		notificationLogger.info(
			`Getting notifications, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.NotificationWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("title", "description", "category")
			const searchFields = ["title", "description", "category"];
			if (query) {
				const searchConditions = buildSearchConditions("Notification", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				try {
					const trimmedFilter = filter.trim();
					// Check if filter is JSON format
					if (trimmedFilter.startsWith("[") || trimmedFilter.startsWith("{")) {
						JSON.parse(filter); // Validate JSON format
						// For JSON format filters, we'd need different handling
						// For now, just validate and skip
					} else if (!trimmedFilter.includes(":")) {
						// If it's not JSON and doesn't contain ':', it's invalid format
						throw new Error(
							"Invalid filter format: must be either JSON or key:value format",
						);
					} else {
						const filterConditions = buildFilterConditions("Notification", filter);
						if (filterConditions.length > 0) {
							whereClause.AND = filterConditions;
						}
					}
				} catch (filterError) {
					notificationLogger.error(`Invalid filter format: ${filter}`);
					res.status(400).json(buildErrorResponse("Invalid filter format", 400));
					return;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [notifications, total] = await Promise.all([
				document ? prisma.notification.findMany(findManyQuery) : [],
				count ? prisma.notification.count({ where: whereClause }) : 0,
			]);

			notificationLogger.info(`Retrieved ${notifications.length} notifications`);

			let responseData: any;

			if (groupBy && document) {
				const grouped = groupDataByField(notifications, groupBy as string);
				responseData = {
					grouped,
					groupBy,
					totalGroups: Object.keys(grouped).length,
					totalItems: notifications.length,
				};
			} else if (document) {
				// Return array directly when not grouping
				responseData = notifications;
			} else {
				// Return object with count and pagination if requested
				responseData = {
					...(count && { count: total }),
					...(pagination && { pagination: buildPagination(total, page, limit) }),
				};
			}

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.NOTIFICATION.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.GET_ALL_FAILED}: ${error}`);
			// Handle Prisma errors
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				typeof (error as any).code === "string"
			) {
				const errorResponse = buildErrorResponse("Database operation failed", 400);
				res.status(400).json(errorResponse);
				return;
			}
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
				notificationLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (!isValidObjectId(id)) {
				notificationLogger.error(`Invalid ID format: ${id}`);
				const errorResponse = buildErrorResponse("Invalid ID format", 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				notificationLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			notificationLogger.info(`${config.SUCCESS.NOTIFICATION.GETTING_BY_ID}: ${id}`);

			const fieldsStr = typeof fields === "string" ? fields : undefined;
			const cacheKey = `cache:notification:byId:${id}:${fieldsStr || "full"}`;
			let notification = null;

			try {
				if (redisClient.isClientConnected()) {
					notification = await redisClient.getJSON(cacheKey);
					if (notification) {
						notificationLogger.info(
							`Notification ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				notificationLogger.warn(
					`Redis cache retrieval failed for notification ${id}:`,
					cacheError,
				);
			}

			if (!notification) {
				const query: Prisma.NotificationFindUniqueArgs = {
					where: { id },
				};

				query.select = getNestedFields(fieldsStr);

				notification = await prisma.notification.findUnique(query);

				if (notification && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, notification, 3600);
						notificationLogger.info(`Notification ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						notificationLogger.warn(
							`Failed to store notification ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!notification) {
				notificationLogger.error(`${config.ERROR.NOTIFICATION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTIFICATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			notificationLogger.info(
				`${config.SUCCESS.NOTIFICATION.RETRIEVED}: ${(notification as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.RETRIEVED,
				notification,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.ERROR_GETTING}: ${error}`);
			// Handle Prisma errors
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				typeof (error as any).code === "string"
			) {
				const errorResponse = buildErrorResponse("Database operation failed", 400);
				res.status(400).json(errorResponse);
				return;
			}
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
				notificationLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (!isValidObjectId(id)) {
				notificationLogger.error(`Invalid ID format: ${id}`);
				const errorResponse = buildErrorResponse("Invalid ID format", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateNotificationSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				notificationLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			notificationLogger.info(`Updating notification: ${id}`);

			const existingNotification = await prisma.notification.findFirst({
				where: { id },
			});

			if (!existingNotification) {
				notificationLogger.error(`${config.ERROR.NOTIFICATION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTIFICATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedNotification = await prisma.notification.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:notification:byId:${id}:*`);
				await invalidateCache.byPattern("cache:notification:list:*");
				notificationLogger.info(`Cache invalidated after notification ${id} update`);
			} catch (cacheError) {
				notificationLogger.warn(
					"Failed to invalidate cache after notification update:",
					cacheError,
				);
			}

			notificationLogger.info(
				`${config.SUCCESS.NOTIFICATION.UPDATED}: ${updatedNotification.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.UPDATED,
				updatedNotification,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.ERROR_UPDATING}: ${error}`);
			// Handle Prisma errors
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				typeof (error as any).code === "string"
			) {
				const errorResponse = buildErrorResponse("Database operation failed", 400);
				res.status(400).json(errorResponse);
				return;
			}
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
				notificationLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (!isValidObjectId(id)) {
				notificationLogger.error(`Invalid ID format: ${id}`);
				const errorResponse = buildErrorResponse("Invalid ID format", 400);
				res.status(400).json(errorResponse);
				return;
			}

			notificationLogger.info(`${config.SUCCESS.NOTIFICATION.DELETED}: ${id}`);

			const existingNotification = await prisma.notification.findFirst({
				where: { id },
			});

			if (!existingNotification) {
				notificationLogger.error(`${config.ERROR.NOTIFICATION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTIFICATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.notification.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:notification:byId:${id}:*`);
				await invalidateCache.byPattern("cache:notification:list:*");
				notificationLogger.info(`Cache invalidated after notification ${id} deletion`);
			} catch (cacheError) {
				notificationLogger.warn(
					"Failed to invalidate cache after notification deletion:",
					cacheError,
				);
			}

			notificationLogger.info(`${config.SUCCESS.NOTIFICATION.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.DELETE_FAILED}: ${error}`);
			// Handle Prisma errors
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				typeof (error as any).code === "string"
			) {
				const errorResponse = buildErrorResponse("Database operation failed", 400);
				res.status(400).json(errorResponse);
				return;
			}
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const testReminder = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			// Optional: allow setting a custom time for testing
			const testTimeParam = req.query.testTime as string | undefined;
			const testTime = testTimeParam ? new Date(testTimeParam) : new Date();

			notificationLogger.info(`Manual reminder test triggered at ${testTime.toISOString()}`);

			// Run the reminder function
			await runBookingDropoffReminder(prisma, testTime);

			// Count notifications created in the last minute
			const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
			const recentNotifications = await prisma.notification.count({
				where: {
					category: "booking_dropoff_reminder",
					createdAt: {
						gte: oneMinuteAgo,
					},
				},
			});

			// Get recent notifications for details
			const recentNotificationsList = await prisma.notification.findMany({
				where: {
					category: "booking_dropoff_reminder",
					createdAt: {
						gte: oneMinuteAgo,
					},
				},
				select: {
					id: true,
					title: true,
					description: true,
					metadata: true,
					createdAt: true,
				},
				orderBy: {
					createdAt: "desc",
				},
				take: 10,
			});

			const successResponse = buildSuccessResponse(
				"Reminder cron test completed successfully",
				{
					testTime: testTime.toISOString(),
					notificationsCreated: recentNotifications,
					recentNotifications: recentNotificationsList,
					message: `Reminder scan completed. Found ${recentNotifications} notification(s) created in the last minute.`,
				},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`Reminder test failed: ${error}`);
			const errorResponse = buildErrorResponse(
				`Reminder test failed: ${error instanceof Error ? error.message : String(error)}`,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove, testReminder };
};
