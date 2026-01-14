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
import { CreateProductSchema, UpdateProductSchema, ProductImageType } from "../../zod/products.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import {
	uploadMultipleToCloudinary,
	deleteMultipleFromCloudinary,
} from "../../helper/cloudinaryUpload";

const logger = getLogger();
const productsLogger = logger.child({ module: "products" });

// Product Image Type Mapping
const PRODUCT_IMAGE_TYPE_MAP: Record<string, ProductImageType> = {
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

// Structure for uploaded image info for Product
interface ProductUploadedImageInfo {
	name: string;
	url: string;
	type: ProductImageType;
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
			productsLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			// Convert string numbers to actual numbers
			requestData = convertStringNumbers(requestData);
			productsLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		// Handle image uploads if files are present (multipart/form-data)
		let productImages: ProductUploadedImageInfo[] = [];
		if (req.files && Object.keys(req.files as any).length > 0) {
			try {
				const files = req.files as { [fieldname: string]: Express.Multer.File[] };

				// Count total images for logging
				let totalImages = 0;
				for (const fieldName of Object.keys(PRODUCT_IMAGE_TYPE_MAP)) {
					const fieldFiles = files[fieldName] || [];
					totalImages += fieldFiles.length;
				}

				productsLogger.info(`Processing ${totalImages} uploaded product images`);

				// Process each image type field
				for (const [fieldName, imageType] of Object.entries(PRODUCT_IMAGE_TYPE_MAP)) {
					const fieldFiles = files[fieldName] || [];
					if (fieldFiles.length === 0) continue;

					const productId = requestData.sku || requestData.name || "default";
					const uploadResults = await uploadMultipleToCloudinary(fieldFiles, {
						folder: `products/${productId}/${imageType.toLowerCase()}`,
					});

					for (let index = 0; index < uploadResults.length; index++) {
						const result = uploadResults[index];
						if (result.success && result.secureUrl) {
							const originalName =
								fieldFiles[index].originalname ||
								`${imageType.toLowerCase()}-${index + 1}`;
							const nameWithoutExtension = originalName.replace(/\.[^/.]+$/, "");

							productImages.push({
								name: nameWithoutExtension,
								url: result.secureUrl,
								type: imageType,
							});
						}
					}

					productsLogger.info(
						`Successfully uploaded ${productImages.length} product images (so far) to Cloudinary`,
					);
				}
			} catch (uploadError: any) {
				productsLogger.error(`Error uploading product images: ${uploadError.message}`);
				const errorResponse = buildErrorResponse("Failed to upload images", 500, [
					{ field: "images", message: uploadError.message },
				]);
				res.status(500).json(errorResponse);
				return;
			}
		}

		const validation = CreateProductSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			productsLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const product = await prisma.product.create({
				data: {
					...validation.data,
					images: productImages.length > 0 ? productImages : undefined,
				} as any,
			});
			productsLogger.info(`Product created successfully: ${product.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.PRODUCTS.ACTIONS.CREATE_PRODUCTS,
				description: `${config.ACTIVITY_LOG.PRODUCTS.DESCRIPTIONS.PRODUCTS_CREATED}: ${product.name || product.id}`,
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
				entityId: product.id,
				changesBefore: null,
				changesAfter: {
					id: product.id,
					name: product.name,
					description: product.description,
					createdAt: product.createdAt,
					updatedAt: product.updatedAt,
				},
				description: `${config.AUDIT_LOG.PRODUCTS.DESCRIPTIONS.PRODUCTS_CREATED}: ${product.name || product.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:products:list:*");
				productsLogger.info("Products list cache invalidated after creation");
			} catch (cacheError) {
				productsLogger.warn(
					"Failed to invalidate cache after products creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRODUCTS.CREATED,
				product,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			productsLogger.error(`${config.ERROR.PRODUCTS.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, productsLogger);

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

		productsLogger.info(
			`Getting productss, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.ProductWhereInput = {};

			// search fields for products (name, description, category, brand)
			const searchFields = ["name", "description", "category", "brand"];
			if (query) {
				const searchConditions = buildSearchConditions("Product", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Product", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [products, total] = await Promise.all([
				document ? prisma.product.findMany(findManyQuery) : [],
				count ? prisma.product.count({ where: whereClause }) : 0,
			]);

			productsLogger.info(`Retrieved ${products.length} products`);
			const processedData =
				groupBy && document ? groupDataByField(products, groupBy as string) : products;

			const responseData: Record<string, any> = {
				...(document && { products: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.PRODUCTS.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			productsLogger.error(`${config.ERROR.PRODUCTS.GET_ALL_FAILED}: ${error}`);
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
				productsLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			if (fields && typeof fields !== "string") {
				productsLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			productsLogger.info(`${config.SUCCESS.PRODUCTS.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:products:byId:${id}:${fields || "full"}`;
			let product = null;

			try {
				if (redisClient.isClientConnected()) {
					product = await redisClient.getJSON(cacheKey);
					if (product) {
						productsLogger.info(`Product ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				productsLogger.warn(`Redis cache retrieval failed for product ${id}:`, cacheError);
			}

			if (!product) {
				const query: Prisma.ProductFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				product = await prisma.product.findFirst(query);

				if (product && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, product, 3600);
						productsLogger.info(`Product ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						productsLogger.warn(
							`Failed to store product ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!product) {
				productsLogger.error(`${config.ERROR.PRODUCTS.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRODUCTS.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			productsLogger.info(`${config.SUCCESS.PRODUCTS.RETRIEVED}: ${(product as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRODUCTS.RETRIEVED,
				product,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			productsLogger.error(`${config.ERROR.PRODUCTS.ERROR_GETTING}: ${error}`);
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
				productsLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
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

			const validationResult = UpdateProductSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				productsLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				productsLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			productsLogger.info(`Updating product: ${id}`);

			const existingProduct = await prisma.product.findFirst({
				where: { id },
			});

			if (!existingProduct) {
				productsLogger.error(`${config.ERROR.PRODUCTS.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRODUCTS.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Handle image uploads if files are present
			let productImages: ProductUploadedImageInfo[] = [];
			const existingImages =
				(existingProduct.images as unknown as ProductUploadedImageInfo[]) || [];

			if (req.files && Object.keys(req.files as any).length > 0) {
				try {
					const files = req.files as { [fieldname: string]: Express.Multer.File[] };

					let totalImages = 0;
					for (const fieldName of Object.keys(PRODUCT_IMAGE_TYPE_MAP)) {
						const fieldFiles = files[fieldName] || [];
						totalImages += fieldFiles.length;
					}

					productsLogger.info(
						`Processing ${totalImages} uploaded product images for update`,
					);

					for (const [fieldName, imageType] of Object.entries(PRODUCT_IMAGE_TYPE_MAP)) {
						const fieldFiles = files[fieldName] || [];
						if (fieldFiles.length === 0) continue;

						const productId = id;
						const uploadResults = await uploadMultipleToCloudinary(fieldFiles, {
							folder: `products/${productId}/${imageType.toLowerCase()}`,
						});

						for (let index = 0; index < uploadResults.length; index++) {
							const result = uploadResults[index];
							if (result.success && result.secureUrl) {
								const originalName =
									fieldFiles[index].originalname ||
									`${imageType.toLowerCase()}-${index + 1}`;
								const nameWithoutExtension = originalName.replace(/\.[^/.]+$/, "");

								productImages.push({
									name: nameWithoutExtension,
									url: result.secureUrl,
									type: imageType,
								});
							}
						}
					}

					productsLogger.info(
						`Successfully uploaded ${productImages.length} new product images to Cloudinary`,
					);
				} catch (uploadError: any) {
					productsLogger.error(`Error uploading product images: ${uploadError.message}`);
					const errorResponse = buildErrorResponse("Failed to upload images", 500, [
						{ field: "images", message: uploadError.message },
					]);
					res.status(500).json(errorResponse);
					return;
				}
			}

			// Merge images: if images array provided in body, use it (allows deletion)
			// Otherwise, merge new uploads with existing images
			let finalImages: ProductUploadedImageInfo[] = existingImages;
			if (validatedData.images !== undefined) {
				// If images array is explicitly provided, use it (replacement)
				finalImages = validatedData.images as ProductUploadedImageInfo[];
			}
			// Merge new uploads with final images
			if (productImages.length > 0) {
				finalImages = [...finalImages, ...productImages];
			}

			const prismaData = {
				...validatedData,
				images: finalImages.length > 0 ? finalImages : undefined,
			};

			const updatedProduct = await prisma.product.update({
				where: { id },
				data: prismaData as any,
			});

			try {
				await invalidateCache.byPattern(`cache:products:byId:${id}:*`);
				await invalidateCache.byPattern("cache:products:list:*");
				productsLogger.info(`Cache invalidated after product ${id} update`);
			} catch (cacheError) {
				productsLogger.warn("Failed to invalidate cache after product update:", cacheError);
			}

			productsLogger.info(`${config.SUCCESS.PRODUCTS.UPDATED}: ${updatedProduct.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRODUCTS.UPDATED,
				{ product: updatedProduct },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			productsLogger.error(`${config.ERROR.PRODUCTS.ERROR_UPDATING}: ${error}`);
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
				productsLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Ensure id is a string
			const id = Array.isArray(rawId) ? rawId[0] : rawId;

			productsLogger.info(`${config.SUCCESS.PRODUCTS.DELETED}: ${id}`);

			const existingProduct = await prisma.product.findFirst({
				where: { id },
			});

			if (!existingProduct) {
				productsLogger.error(`${config.ERROR.PRODUCTS.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRODUCTS.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.product.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:products:byId:${id}:*`);
				await invalidateCache.byPattern("cache:products:list:*");
				productsLogger.info(`Cache invalidated after products ${id} deletion`);
			} catch (cacheError) {
				productsLogger.warn(
					"Failed to invalidate cache after product deletion:",
					cacheError,
				);
			}

			productsLogger.info(`${config.SUCCESS.PRODUCTS.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.PRODUCTS.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			productsLogger.error(`${config.ERROR.PRODUCTS.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
