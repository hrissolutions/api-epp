import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams, validateObjectId } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { addOrganizationFilter } from "../../helper/organization-filter";
import { CreateItemSchema, UpdateItemSchema, ItemImageType } from "../../zod/items.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import {
	uploadMultipleToCloudinary,
	deleteMultipleFromCloudinary,
} from "../../helper/cloudinaryUpload";
import csvParser from "csv-parser";
import { Readable } from "stream";
import * as fs from "fs";

const logger = getLogger();
const itemsLogger = logger.child({ module: "items" });

// Item Image Type Mapping
const ITEM_IMAGE_TYPE_MAP: Record<string, ItemImageType> = {
	coverImages: "COVER",
	featuredImages: "FEATURED",
	galleryImages: "GALLERY",
	thumbnailImages: "THUMBNAIL",
	packagingImages: "PACKAGING",
	detailImages: "DETAIL",
	lifestyleImages: "LIFESTYLE",
	sizeChartImages: "SIZE_CHART",
	instructionImages: "INSTRUCTION",
	images: "GALLERY", // fallback for generic images
};

// Structure for uploaded image info for Item
interface ItemUploadedImageInfo {
	name: string;
	url: string;
	type: ItemImageType;
}

// Helper function to parse number with comma separators (e.g., "22,995" -> 22995)
const parseNumberWithCommas = (value: string | number | null | undefined): number | null => {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		// Remove commas and whitespace, then parse
		const cleaned = value.trim().replace(/,/g, "");
		const parsed = parseFloat(cleaned);
		return isNaN(parsed) ? null : parsed;
	}

	return null;
};

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
		// Also handle comma-separated numbers
		const cleaned = obj.trim().replace(/,/g, "");
		if (/^-?\d+\.?\d*$/.test(cleaned) && cleaned !== "") {
			const num = parseFloat(cleaned);
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
			itemsLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			// Convert string numbers to actual numbers
			requestData = convertStringNumbers(requestData);
			itemsLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		// Handle image uploads if files are present (multipart/form-data)
		let itemImages: ItemUploadedImageInfo[] = [];
		if (req.files && Object.keys(req.files as any).length > 0) {
			try {
				const files = req.files as { [fieldname: string]: Express.Multer.File[] };

				// Count total images for logging
				let totalImages = 0;
				for (const fieldName of Object.keys(ITEM_IMAGE_TYPE_MAP)) {
					const fieldFiles = files[fieldName] || [];
					totalImages += fieldFiles.length;
				}

				itemsLogger.info(`Processing ${totalImages} uploaded item images`);

				// Process each image type field
				for (const [fieldName, imageType] of Object.entries(ITEM_IMAGE_TYPE_MAP)) {
					const fieldFiles = files[fieldName] || [];
					if (fieldFiles.length === 0) continue;

					const itemId = requestData.sku || requestData.name || "default";
					const uploadResults = await uploadMultipleToCloudinary(fieldFiles, {
						folder: `items/${itemId}/${imageType.toLowerCase()}`,
					});

					for (let index = 0; index < uploadResults.length; index++) {
						const result = uploadResults[index];
						if (result.success && result.secureUrl) {
							const originalName =
								fieldFiles[index].originalname ||
								`${imageType.toLowerCase()}-${index + 1}`;
							const nameWithoutExtension = originalName.replace(/\.[^/.]+$/, "");

							itemImages.push({
								name: nameWithoutExtension,
								url: result.secureUrl,
								type: imageType,
							});
						}
					}

					itemsLogger.info(
						`Successfully uploaded ${itemImages.length} item images (so far) to Cloudinary`,
					);
				}
			} catch (uploadError: any) {
				itemsLogger.error(`Error uploading item images: ${uploadError.message}`);
				const errorResponse = buildErrorResponse("Failed to upload images", 500, [
					{ field: "images", message: uploadError.message },
				]);
				res.status(500).json(errorResponse);
				return;
			}
		}

		const validation = CreateItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			itemsLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const item = await prisma.item.create({
				data: {
					...validation.data,
					images: itemImages.length > 0 ? itemImages : undefined,
					organizationId: (req as any).organizationId || validation.data.organizationId,
				} as any,
			});
			itemsLogger.info(`Item created successfully: ${item.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.PRODUCTS.ACTIONS.CREATE_PRODUCTS,
				description: `${config.ACTIVITY_LOG.PRODUCTS.DESCRIPTIONS.PRODUCTS_CREATED}: ${item.name || item.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.PRODUCTS.PAGES.PRODUCTS_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.PRODUCTS,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.PRODUCTS,
				entityId: item.id,
				changesBefore: null,
				changesAfter: {
					id: item.id,
					name: item.name,
					description: item.description,
					createdAt: item.createdAt,
					updatedAt: item.updatedAt,
				},
				description: `${config.AUDIT_LOG.PRODUCTS.DESCRIPTIONS.PRODUCTS_CREATED}: ${item.name || item.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:items:list:*");
				itemsLogger.info("Items list cache invalidated after creation");
			} catch (cacheError) {
				itemsLogger.warn("Failed to invalidate cache after items creation:", cacheError);
			}

			// Create dynamic success message with itemType
			const itemTypeLabel = item.itemType === "LOAN" ? "Loan" : "Product";
			const successMessage = `Item (${itemTypeLabel}) created successfully`;

			const successResponse = buildSuccessResponse(successMessage, item, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			itemsLogger.error(`Error creating item: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, itemsLogger);

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

		itemsLogger.info(
			`Getting items, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			let whereClause: Prisma.ItemWhereInput = {};

			// search fields for items (name, description, category, brand)
			const searchFields = ["name", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("Item", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			// Check if user has explicitly provided status, isAvailable, or isActive filters
			let hasStatusFilter = false;
			let hasIsAvailableFilter = false;
			let hasIsActiveFilter = false;

			if (filter) {
				const filterConditions = buildFilterConditions("Item", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
					// Check if user explicitly filtered by these fields
					const filterString = filter.toLowerCase();
					hasStatusFilter = filterString.includes("status:");
					hasIsAvailableFilter = filterString.includes("isavailable:");
					hasIsActiveFilter = filterString.includes("isactive:");
				}
			}

			// Add organizationId filter from authenticated user
			whereClause = addOrganizationFilter(req, whereClause);

			// Debug logging
			const orgId = (req as any).organizationId;
			itemsLogger.info(`[DEBUG] OrganizationId from token: ${orgId}`);
			itemsLogger.info(`[DEBUG] Where clause before filter: ${JSON.stringify(whereClause, null, 2)}`);

			// Only show approved and available items by default
			// Admin/internal endpoints can still override this via explicit filters if needed
			// const statusVisibilityFilter: any = {
			// 	status: "APPROVED",
			// 	isAvailable: true,
			// 	isActive: true,
			// };

			// if (whereClause.AND) {
			// 	(whereClause as any).AND = [
			// 		statusVisibilityFilter,
			// 		...((whereClause.AND as Prisma.ItemWhereInput[]) || []),
			// 	];
			// } else {
			// 	(whereClause as any).AND = [statusVisibilityFilter];
			// }
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			// Debug: Check total items and items with matching organizationId
			const totalWithoutFilter = await prisma.item.count();
			
			// Test with raw MongoDB query to see actual data
			let rawMongoCount = 0;
			let rawMongoSample: any = null;
			try {
				const rawCountResult = await prisma.$runCommandRaw({
					count: "items",
					query: {
						organizationId: orgId,
					},
				});
				rawMongoCount = (rawCountResult as any).n || 0;
				
				// Get a sample document to see the actual type
				const rawFindResult = await prisma.$runCommandRaw({
					find: "items",
					filter: {
						organizationId: orgId,
					},
					limit: 1,
				});
				const docs = (rawFindResult as any).cursor?.firstBatch || [];
				if (docs.length > 0) {
					rawMongoSample = docs[0];
					itemsLogger.info(`[DEBUG] Sample document organizationId type: ${typeof rawMongoSample.organizationId}, value: ${JSON.stringify(rawMongoSample.organizationId)}`);
				}
			} catch (error) {
				itemsLogger.warn(`[DEBUG] Raw MongoDB query error: ${error}`);
			}
			
			const totalWithOrgId = await prisma.item.count({
				where: { organizationId: orgId || undefined },
			});
			const totalWithNullOrgId = await prisma.item.count({
				where: { organizationId: null },
			});
			
			itemsLogger.info(`[DEBUG] Total items in database (no filter): ${totalWithoutFilter}`);
			itemsLogger.info(`[DEBUG] Raw MongoDB count with organizationId="${orgId}": ${rawMongoCount}`);
			itemsLogger.info(`[DEBUG] Prisma count with organizationId="${orgId}": ${totalWithOrgId}`);
			itemsLogger.info(`[DEBUG] Items with organizationId=null: ${totalWithNullOrgId}`);
			itemsLogger.info(`[DEBUG] Final where clause: ${JSON.stringify(whereClause, null, 2)}`);

			const [items, total] = await Promise.all([
				document ? prisma.item.findMany(findManyQuery) : [],
				count ? prisma.item.count({ where: whereClause }) : 0,
			]);

			itemsLogger.info(`[DEBUG] Retrieved ${items.length} items with organizationId filter`);
			itemsLogger.info(`[DEBUG] Total count with filter: ${total}`);
			const processedData =
				groupBy && document ? groupDataByField(items, groupBy as string) : items;

			const responseData: Record<string, any> = {
				...(document && { items: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse("Items retrieved successfully", responseData, 200),
			);
		} catch (error) {
			itemsLogger.error(`Error getting items: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: rawId } = req.params;
		const { fields } = req.query;

		try {
			// Validate ObjectId format
			const idValidation = validateObjectId(rawId, "Item ID");
			if (!idValidation.isValid) {
				itemsLogger.error(`Invalid item ID: ${rawId}`);
				res.status(400).json(idValidation.errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				itemsLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			itemsLogger.info(`Getting item by ID: ${id}`);

			const cacheKey = `cache:items:byId:${id}:${fields || "full"}`;
			let item = null;

			try {
				if (redisClient.isClientConnected()) {
					item = await redisClient.getJSON(cacheKey);
					if (item) {
						itemsLogger.info(`Item ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				itemsLogger.warn(`Redis cache retrieval failed for item ${id}:`, cacheError);
			}

			if (!item) {
				let whereClause: Prisma.ItemWhereInput = { id };
				whereClause = addOrganizationFilter(req, whereClause);

				const query: Prisma.ItemFindFirstArgs = {
					where: whereClause as any,
				};

				query.select = getNestedFields(fields);

				item = await prisma.item.findFirst(query);

				if (item && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, item, 3600);
						itemsLogger.info(`Item ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						itemsLogger.warn(`Failed to store item ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!item) {
				itemsLogger.error(`Item not found: ${id}`);
				const errorResponse = buildErrorResponse("Item not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			itemsLogger.info(`Item retrieved: ${(item as any).id}`);
			const successResponse = buildSuccessResponse("Item retrieved successfully", item, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			itemsLogger.error(`Error getting item: ${error}`);
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
			// Validate ObjectId format
			const idValidation = validateObjectId(rawId, "Item ID");
			if (!idValidation.isValid) {
				itemsLogger.error(`Invalid item ID: ${rawId}`);
				res.status(400).json(idValidation.errorResponse);
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

			const validationResult = UpdateItemSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				itemsLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				itemsLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			itemsLogger.info(`Updating item: ${id}`);

			const existingItem = await prisma.item.findFirst({
				where: { id },
			});

			if (!existingItem) {
				itemsLogger.error(`Item not found: ${id}`);
				const errorResponse = buildErrorResponse("Item not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Handle image uploads if files are present
			let itemImages: ItemUploadedImageInfo[] = [];
			const existingImages =
				(existingItem.images as unknown as ItemUploadedImageInfo[]) || [];

			if (req.files && Object.keys(req.files as any).length > 0) {
				try {
					const files = req.files as { [fieldname: string]: Express.Multer.File[] };

					let totalImages = 0;
					for (const fieldName of Object.keys(ITEM_IMAGE_TYPE_MAP)) {
						const fieldFiles = files[fieldName] || [];
						totalImages += fieldFiles.length;
					}

					itemsLogger.info(`Processing ${totalImages} uploaded item images for update`);

					for (const [fieldName, imageType] of Object.entries(ITEM_IMAGE_TYPE_MAP)) {
						const fieldFiles = files[fieldName] || [];
						if (fieldFiles.length === 0) continue;

						const itemId = id;
						const uploadResults = await uploadMultipleToCloudinary(fieldFiles, {
							folder: `items/${itemId}/${imageType.toLowerCase()}`,
						});

						for (let index = 0; index < uploadResults.length; index++) {
							const result = uploadResults[index];
							if (result.success && result.secureUrl) {
								const originalName =
									fieldFiles[index].originalname ||
									`${imageType.toLowerCase()}-${index + 1}`;
								const nameWithoutExtension = originalName.replace(/\.[^/.]+$/, "");

								itemImages.push({
									name: nameWithoutExtension,
									url: result.secureUrl,
									type: imageType,
								});
							}
						}
					}

					itemsLogger.info(
						`Successfully uploaded ${itemImages.length} new item images to Cloudinary`,
					);
				} catch (uploadError: any) {
					itemsLogger.error(`Error uploading item images: ${uploadError.message}`);
					const errorResponse = buildErrorResponse("Failed to upload images", 500, [
						{ field: "images", message: uploadError.message },
					]);
					res.status(500).json(errorResponse);
					return;
				}
			}

			// Merge images: if images array provided in body, use it (allows deletion)
			// Otherwise, merge new uploads with existing images
			let finalImages: ItemUploadedImageInfo[] = existingImages;
			if (validatedData.images !== undefined) {
				// If images array is explicitly provided, use it (replacement)
				finalImages = validatedData.images as ItemUploadedImageInfo[];
			}
			// Merge new uploads with final images
			if (itemImages.length > 0) {
				finalImages = [...finalImages, ...itemImages];
			}

			const prismaData = {
				...validatedData,
				images: finalImages.length > 0 ? finalImages : undefined,
			};

			const updatedItem = await prisma.item.update({
				where: { id },
				data: prismaData as any,
			});

			try {
				await invalidateCache.byPattern(`cache:items:byId:${id}:*`);
				await invalidateCache.byPattern("cache:items:list:*");
				itemsLogger.info(`Cache invalidated after item ${id} update`);
			} catch (cacheError) {
				itemsLogger.warn("Failed to invalidate cache after item update:", cacheError);
			}

			itemsLogger.info(`${config.SUCCESS.PRODUCTS.UPDATED}: ${updatedItem.id}`);
			// Create dynamic success message with itemType
			const itemTypeLabel = updatedItem.itemType === "LOAN" ? "Loan" : "Product";
			const successMessage = `Item (${itemTypeLabel}) updated successfully`;

			const successResponse = buildSuccessResponse(
				successMessage,
				{ item: updatedItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			itemsLogger.error(`${config.ERROR.PRODUCTS.ERROR_UPDATING}: ${error}`);
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
			// Validate ObjectId format
			const idValidation = validateObjectId(rawId, "Item ID");
			if (!idValidation.isValid) {
				itemsLogger.error(`Invalid item ID: ${rawId}`);
				res.status(400).json(idValidation.errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			itemsLogger.info(`Item deleted: ${id}`);

			const existingItem = await prisma.item.findFirst({
				where: { id },
			});

			if (!existingItem) {
				itemsLogger.error(`Item not found: ${id}`);
				const errorResponse = buildErrorResponse("Item not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Get itemType before deletion for the success message
			const itemType = existingItem.itemType || "PRODUCT";
			const itemTypeLabel = itemType === "LOAN" ? "Loan" : "Product";

			await prisma.item.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:items:byId:${id}:*`);
				await invalidateCache.byPattern("cache:items:list:*");
				itemsLogger.info(`Cache invalidated after items ${id} deletion`);
			} catch (cacheError) {
				itemsLogger.warn("Failed to invalidate cache after item deletion:", cacheError);
			}

			// Create dynamic success message with itemType
			const successMessage = `Item (${itemTypeLabel}) deleted successfully`;
			itemsLogger.info(`${successMessage}: ${id}`);
			const successResponse = buildSuccessResponse(successMessage, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			itemsLogger.error(`Error deleting item: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// Helper function to generate unique SKU by appending suffix
	const generateUniqueSKU = async (
		originalSku: string,
		existingSkus: Set<string>,
		importBatchSkus: Map<string, number>,
	): Promise<string> => {
		let newSku = originalSku;
		let counter = 1;

		// Check if SKU exists in database or in current import batch
		while (existingSkus.has(newSku) || importBatchSkus.has(newSku)) {
			// Try appending -1, -2, -3, etc.
			newSku = `${originalSku}-${counter}`;
			counter++;
		}

		return newSku;
	};

	const importFromCSV = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			if (!req.file) {
				itemsLogger.error("No CSV file uploaded");
				const errorResponse = buildErrorResponse("CSV file is required", 400, [
					{ field: "file", message: "Please upload a CSV file" },
				]);
				res.status(400).json(errorResponse);
				return;
			}

			itemsLogger.info(`Starting CSV import from file: ${req.file.originalname}`);

			const results: any[] = [];
			const errors: any[] = [];
			const skuChanges: Array<{ original: string; new: string; row: number }> = [];
			let processedCount = 0;
			let successCount = 0;
			let errorCount = 0;

			// Track SKUs in current import batch to detect duplicates within the file
			const importBatchSkus = new Map<string, number>(); // Map<sku, count>

			// Parse CSV file
			const parseCSV = (): Promise<void> => {
				return new Promise((resolve, reject) => {
					const stream = Readable.from(req.file!.buffer.toString());

					stream
						.pipe(csvParser())
						.on("data", (row) => {
							results.push(row);
						})
						.on("end", () => {
							resolve();
						})
						.on("error", (error) => {
							reject(error);
						});
				});
			};

			try {
				await parseCSV();
				itemsLogger.info(`CSV parsed successfully, found ${results.length} rows`);
			} catch (parseError: any) {
				itemsLogger.error(`CSV parsing error: ${parseError.message}`);
				const errorResponse = buildErrorResponse("Failed to parse CSV file", 400, [
					{ field: "file", message: parseError.message },
				]);
				res.status(400).json(errorResponse);
				return;
			}

			// Fetch all existing SKUs from database to check for duplicates
			const existingItems = await prisma.item.findMany({
				select: { sku: true },
			});
			const existingSkus = new Set<string>(existingItems.map((i) => i.sku));
			itemsLogger.info(`Found ${existingSkus.size} existing SKUs in database`);

			// Process each row
			for (let i = 0; i < results.length; i++) {
				const row = results[i];
				processedCount++;

				try {
					// Look up category by slug
					let categoryId: string | null = null;
					if (row.category && row.category.trim()) {
						const category = await prisma.category.findFirst({
							where: { slug: row.category.trim() },
							select: { id: true },
						});

						if (!category) {
							errors.push({
								row: i + 1,
								sku: row.sku,
								error: `Category not found with slug: ${row.category}`,
							});
							errorCount++;
							itemsLogger.warn(
								`Row ${i + 1} (SKU: ${row.sku}): Category not found with slug: ${row.category}`,
							);
							continue;
						}

						categoryId = category.id;
					} else {
						errors.push({
							row: i + 1,
							sku: row.sku,
							error: "Category slug is required",
						});
						errorCount++;
						itemsLogger.warn(
							`Row ${i + 1} (SKU: ${row.sku}): Category slug is missing`,
						);
						continue;
					}

					// Look up vendor by code
					let vendorId: string | null = null;
					if (row.vendor && row.vendor.trim()) {
						const vendor = await prisma.vendor.findFirst({
							where: { code: row.vendor.trim() },
							select: { id: true },
						});

						if (!vendor) {
							errors.push({
								row: i + 1,
								sku: row.sku,
								error: `Vendor not found with code: ${row.vendor}`,
							});
							errorCount++;
							itemsLogger.warn(
								`Row ${i + 1} (SKU: ${row.sku}): Vendor not found with code: ${row.vendor}`,
							);
							continue;
						}

						vendorId = vendor.id;
					} else {
						errors.push({
							row: i + 1,
							sku: row.sku,
							error: "Vendor code is required",
						});
						errorCount++;
						itemsLogger.warn(`Row ${i + 1} (SKU: ${row.sku}): Vendor code is missing`);
						continue;
					}

					// Parse images from comma-separated string
					let images: ItemUploadedImageInfo[] = [];
					if (row.images && row.images.trim()) {
						const imageUrls = row.images
							.split(",")
							.map((url: string) => url.trim())
							.filter((url: string) => url);

						images = imageUrls.map((url: string, index: number) => ({
							name: `image-${index + 1}`,
							url: url,
							type: "FEATURED" as ItemImageType,
						}));
					}

					// Parse details from comma-separated string - this becomes the main details array
					let detailsArray: string[] = [];
					if (row.details && row.details.trim()) {
						detailsArray = row.details
							.split(",")
							.map((detail: string) => detail.trim())
							.filter((detail: string) => detail);
					}

					// Parse metadata (additional item information)
					let metadata: any = {};
					if (row.metadata && row.metadata.trim()) {
						try {
							metadata = JSON.parse(row.metadata);
						} catch (jsonError) {
							itemsLogger.warn(
								`Row ${i + 1}: Invalid JSON in metadata field, skipping`,
							);
						}
					}

					// Build specifications object with details array and metadata
					let specifications: any = null;
					if (detailsArray.length > 0 || Object.keys(metadata).length > 0) {
						specifications = {};

						if (detailsArray.length > 0) {
							specifications.details = detailsArray;
						}

						if (Object.keys(metadata).length > 0) {
							specifications.metadata = metadata;
						}
					}

					// Parse additional specifications if provided (JSON format) - merge with existing
					if (row.specifications && row.specifications.trim()) {
						try {
							const additionalSpecs = JSON.parse(row.specifications);
							specifications = specifications || {};
							specifications = {
								...specifications,
								...additionalSpecs,
							};
						} catch (jsonError) {
							itemsLogger.warn(
								`Row ${i + 1}: Invalid JSON in specifications field, skipping`,
							);
						}
					}

					// Handle duplicate SKU - generate unique SKU if needed
					let finalSku = row.sku?.trim() || "";
					const originalSku = finalSku;

					// Check if SKU is duplicate (in database or in current import batch)
					if (existingSkus.has(finalSku) || importBatchSkus.has(finalSku)) {
						// Generate unique SKU
						finalSku = await generateUniqueSKU(
							originalSku,
							existingSkus,
							importBatchSkus,
						);

						// Track the change
						skuChanges.push({
							original: originalSku,
							new: finalSku,
							row: i + 1,
						});

						itemsLogger.warn(
							`Row ${i + 1}: Duplicate SKU "${originalSku}" detected, generated new SKU: "${finalSku}"`,
						);
					}

					// Add to import batch tracking
					importBatchSkus.set(finalSku, (importBatchSkus.get(finalSku) || 0) + 1);
					// Also add to existing SKUs set to prevent duplicates in same batch
					existingSkus.add(finalSku);

					// Parse itemType - default to PRODUCT if not provided
					let itemType: "PRODUCT" | "LOAN" = "PRODUCT";
					if (row.itemType && row.itemType.trim()) {
						const itemTypeValue = row.itemType.trim().toUpperCase();
						if (itemTypeValue === "PRODUCT" || itemTypeValue === "LOAN") {
							itemType = itemTypeValue as "PRODUCT" | "LOAN";
						} else {
							itemsLogger.warn(
								`Row ${i + 1} (SKU: ${row.sku}): Invalid itemType "${row.itemType}", defaulting to PRODUCT`,
							);
						}
					}

					// Prepare item data
					const itemData: any = {
						sku: finalSku,
						name: row.name,
						description:
							row.description && row.description.trim() ? row.description : null,
						categoryId: categoryId,
						vendorId: vendorId,

						// Item type
						itemType: itemType,

						// Pricing - handle multiple price fields with comma separators
						retailPrice: parseNumberWithCommas(row.retailPrice) ?? 0,
						sellingPrice:
							parseNumberWithCommas(row.sellingPrice) ??
							parseNumberWithCommas(row.employeePrice) ??
							0, // Support both old and new field names
						costPrice: parseNumberWithCommas(row.costPrice),

						// Inventory
						stockQuantity: row.stockQuantity ? parseInt(row.stockQuantity) : 0,
						lowStockThreshold: row.lowStockThreshold
							? parseInt(row.lowStockThreshold)
							: 10,

						// Item details
						imageUrl: row.imageUrl || null,
						images: images.length > 0 ? images : null,
						specifications: specifications,

						// Status - handle both uppercase and lowercase TRUE/FALSE
						isActive:
							row.isActive === "true" ||
							row.isActive === "TRUE" ||
							row.isActive === "1" ||
							row.isActive === true ||
							(typeof row.isActive === "string" &&
								row.isActive.toLowerCase() === "true"),
						isFeatured:
							row.isFeatured === "true" ||
							row.isFeatured === "TRUE" ||
							row.isFeatured === "1" ||
							row.isFeatured === true ||
							(typeof row.isFeatured === "string" &&
								row.isFeatured.toLowerCase() === "true"),
						isAvailable:
							row.isAvailable === "true" ||
							row.isAvailable === "TRUE" ||
							row.isAvailable === "1" ||
							row.isAvailable === true ||
							row.isAvailable === undefined ||
							(typeof row.isAvailable === "string" &&
								row.isAvailable.toLowerCase() === "true"),
					};

					// Validate using Zod schema
					const validation = CreateItemSchema.safeParse(itemData);

					if (!validation.success) {
						const formattedErrors = formatZodErrors(validation.error.format());
						errors.push({
							row: i + 1,
							sku: row.sku,
							errors: formattedErrors,
						});
						errorCount++;
						itemsLogger.warn(
							`Row ${i + 1} (SKU: ${row.sku}): Validation failed - ${JSON.stringify(formattedErrors)}`,
						);
						continue;
					}

					// Create item in database
					const item = await prisma.item.create({
						data: {
							...validation.data,
							organizationId:
								(req as any).organizationId || validation.data.organizationId,
						} as any,
					});

					successCount++;
					itemsLogger.info(
						`Row ${i + 1}: Item created successfully (SKU: ${item.sku}, ID: ${item.id})`,
					);
				} catch (error: any) {
					errorCount++;
					errors.push({
						row: i + 1,
						sku: row.sku,
						error: error.message,
					});
					itemsLogger.error(
						`Row ${i + 1} (SKU: ${row.sku}): Failed to create item - ${error.message}`,
					);
				}
			}

			// Invalidate cache after bulk import
			try {
				await invalidateCache.byPattern("cache:items:list:*");
				itemsLogger.info("Items list cache invalidated after CSV import");
			} catch (cacheError) {
				itemsLogger.warn("Failed to invalidate cache after CSV import:", cacheError);
			}

			// Log activity
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "IMPORT_ITEMS_CSV",
				description: `Imported ${successCount} items from CSV (${errorCount} errors)`,
				page: {
					url: req.originalUrl,
					title: "Items CSV Import",
				},
			});

			const responseData = {
				summary: {
					totalRows: results.length,
					processed: processedCount,
					successful: successCount,
					failed: errorCount,
					skuChanges: skuChanges.length,
				},
				skuChanges: skuChanges.length > 0 ? skuChanges : undefined,
				errors: errors.length > 0 ? errors : undefined,
			};

			const skuChangeMessage =
				skuChanges.length > 0
					? `, ${skuChanges.length} SKU(s) auto-generated due to duplicates`
					: "";

			itemsLogger.info(
				`CSV import completed: ${successCount} successful, ${errorCount} failed out of ${results.length} rows${skuChangeMessage}`,
			);

			const successResponse = buildSuccessResponse(
				`Items imported successfully: ${successCount} created, ${errorCount} failed${skuChangeMessage}`,
				responseData,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			itemsLogger.error(`CSV import failed: ${error}`);
			const errorResponse = buildErrorResponse("CSV import failed", 500);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove, importFromCSV };
};
