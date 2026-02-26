import { Router, Request, Response, NextFunction } from "express";
import { uploadDisbursementReceipt } from "../../middleware/upload";
import { cache } from "../../middleware/cache";

interface IController {
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (_route: Router, controller: IController): Router => {
	const route = _route;
	const routes = Router();
	const path = "/admin-supplier-settlement";

	/**
	 * @openapi
	 * /api/admin-supplier-settlement/{id}:
	 *   get:
	 *     summary: Get admin supplier settlement by ID
	 *     description: Retrieve a specific admin-to-supplier settlement record by its unique identifier
	 *     tags: [AdminSupplierSettlement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Settlement ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports dot notation)
	 *         example: "id,amount,supplierId,status"
	 *     responses:
	 *       200:
	 *         description: Settlement retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         adminSupplierSettlement:
	 *                           $ref: '#/components/schemas/AdminSupplierSettlement'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual admin supplier settlement with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:adminSupplierSettlement:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/admin-supplier-settlement:
	 *   get:
	 *     summary: Get all admin supplier settlements
	 *     description: Retrieve admin-to-supplier settlement records with filtering, pagination, sorting, and field selection
	 *     tags: [AdminSupplierSettlement]
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *         description: Page number for pagination
	 *         example: 1
	 *       - in: query
	 *         name: limit
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *         description: Number of records per page
	 *         example: 10
	 *       - in: query
	 *         name: order
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *           default: desc
	 *         description: Sort order for results
	 *         example: desc
	 *       - in: query
	 *         name: sort
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Field to sort by (e.g. createdAt, amount)
	 *         example: "createdAt"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated fields (supports dot notation)
	 *         example: "id,amount,supplierId,status"
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects for advanced filtering
	 *         example: '[{"supplierId":"507f1f77bcf86cd799439011"}]'
	 *       - in: query
	 *         name: query
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Search in referenceNo, notes, receiptNumber
	 *         example: "REF-001"
	 *       - in: query
	 *         name: document
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include settlement documents in response
	 *       - in: query
	 *         name: pagination
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include pagination metadata in response
	 *       - in: query
	 *         name: count
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include total count in response
	 *     responses:
	 *       200:
	 *         description: Admin supplier settlements retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         adminSupplierSettlements:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/AdminSupplierSettlement'
	 *                         count:
	 *                           type: integer
	 *                           description: Present when count="true"
	 *                         pagination:
	 *                           $ref: '#/components/schemas/Pagination'
	 *                           description: Present when pagination="true"
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache admin supplier settlement list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:adminSupplierSettlement:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/admin-supplier-settlement:
	 *   post:
	 *     summary: Create admin supplier settlement
	 *     description: Creates a settlement remittance record for admin-to-supplier payment. Optional multipart field "receipt" (image/PDF) uploads to Cloudinary and sets receiptAttachmentUrl.
	 *     tags: [AdminSupplierSettlement]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - supplierSettlementId
	 *               - amount
	 *             properties:
	 *               supplierSettlementId:
	 *                 type: string
	 *                 description: Supplier settlement ID
	 *               amount:
	 *                 type: number
	 *                 description: Payment amount
	 *               receiptType:
	 *                 type: string
	 *                 enum: [OR, BANK_RECEIPT]
	 *               receiptNumber:
	 *                 type: string
	 *               referenceNo:
	 *                 type: string
	 *               notes:
	 *                 type: string
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               supplierSettlementId:
	 *                 type: string
	 *               amount:
	 *                 type: number
	 *               receipt:
	 *                 type: string
	 *                 format: binary
	 *               receiptType:
	 *                 type: string
	 *                 enum: [OR, BANK_RECEIPT]
	 *               receiptNumber:
	 *                 type: string
	 *     responses:
	 *       201:
	 *         description: Settlement created successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         adminSupplierSettlement:
	 *                           $ref: '#/components/schemas/AdminSupplierSettlement'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", uploadDisbursementReceipt, controller.create);

	/**
	 * @openapi
	 * /api/admin-supplier-settlement/{id}:
	 *   patch:
	 *     summary: Update admin supplier settlement
	 *     description: Partial update. Accepts application/json or multipart/form-data. With multipart, optional file field "receipt" uploads to Cloudinary.
	 *     tags: [AdminSupplierSettlement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Settlement ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             minProperties: 1
	 *             properties:
	 *               amount:
	 *                 type: number
	 *               receiptType:
	 *                 type: string
	 *                 enum: [OR, BANK_RECEIPT]
	 *               receiptNumber:
	 *                 type: string
	 *               referenceNo:
	 *                 type: string
	 *               notes:
	 *                 type: string
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               receipt:
	 *                 type: string
	 *                 format: binary
	 *               receiptType:
	 *                 type: string
	 *                 enum: [OR, BANK_RECEIPT]
	 *               receiptNumber:
	 *                 type: string
	 *               amount:
	 *                 type: number
	 *     responses:
	 *       200:
	 *         description: Settlement updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         adminSupplierSettlement:
	 *                           $ref: '#/components/schemas/AdminSupplierSettlement'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id", uploadDisbursementReceipt, controller.update);

	/**
	 * @openapi
	 * /api/admin-supplier-settlement/{id}:
	 *   delete:
	 *     summary: Delete admin supplier settlement
	 *     description: Permanently delete an admin supplier settlement by ID
	 *     tags: [AdminSupplierSettlement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Settlement ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Settlement deleted successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       description: Empty object for successful deletion
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.delete("/:id", controller.remove);

	route.use(path, routes);
	return route;
};
