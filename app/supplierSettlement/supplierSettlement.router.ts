import { Router, Request, Response, NextFunction } from "express";
import { uploadDisbursementReceipt } from "../../middleware/upload";
import { cache } from "../../middleware/cache";

interface IController {
	getAdminToSupplierSoa(req: Request, res: Response, next: NextFunction): Promise<void>;
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	createRemittance(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	reconcile(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (_route: Router, controller: IController): Router => {
	const route = _route;
	const routes = Router();
	const path = "/supplier-settlement";

	/**
	 * @openapi
	 * /api/supplier-settlement/ledger/supplier/{supplierId}:
	 *   get:
	 *     summary: Get supplier statement of account (SOA / ledger)
	 *     description: Retrieve the admin-to-supplier statement of account for a specific supplier. Use ?view=admin for admin perspective or ?view=supplier for supplier perspective.
	 *     tags: [SupplierSettlement]
	 *     parameters:
	 *       - in: path
	 *         name: supplierId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Supplier ID
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: view
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [admin, supplier]
	 *           default: admin
	 *         description: Perspective for the SOA view
	 *         example: "admin"
	 *       - in: query
	 *         name: startDate
	 *         required: false
	 *         schema:
	 *           type: string
	 *           format: date
	 *         description: Filter from date
	 *         example: "2024-01-01"
	 *       - in: query
	 *         name: endDate
	 *         required: false
	 *         schema:
	 *           type: string
	 *           format: date
	 *         description: Filter to date
	 *         example: "2024-12-31"
	 *     responses:
	 *       200:
	 *         description: Supplier SOA retrieved successfully
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
	 *                         ledger:
	 *                           type: array
	 *                           items:
	 *                             type: object
	 *                         totalPayable:
	 *                           type: number
	 *                         totalPaid:
	 *                           type: number
	 *                         balance:
	 *                           type: number
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Ledger: GET /api/supplier-settlement/ledger/supplier/:supplierId?view=admin|supplier
	routes.get(
		"/ledger/supplier/:supplierId",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:supplierSettlement:ledger:${req.params.supplierId}:${queryKey}`;
			},
		}),
		controller.getAdminToSupplierSoa,
	);

	/**
	 * @openapi
	 * /api/supplier-settlement/{id}:
	 *   get:
	 *     summary: Get supplier settlement by ID
	 *     description: Retrieve a specific supplier settlement record by its unique identifier
	 *     tags: [SupplierSettlement]
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
	 *         description: Supplier settlement retrieved successfully
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
	 *                         supplierSettlement:
	 *                           $ref: '#/components/schemas/SupplierSettlement'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual supplier settlement with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:supplierSettlement:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/supplier-settlement:
	 *   get:
	 *     summary: Get all supplier settlements
	 *     description: Retrieve supplier settlement records with filtering, pagination, sorting, and field selection
	 *     tags: [SupplierSettlement]
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
	 *         description: Field to sort by
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
	 *         description: Search in referenceNo, notes
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
	 *         description: Supplier settlements retrieved successfully
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
	 *                         supplierSettlements:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/SupplierSettlement'
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
	// Cache supplier settlement list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:supplierSettlement:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/supplier-settlement:
	 *   post:
	 *     summary: Create supplier settlement
	 *     description: Create a new supplier settlement record (payable to supplier)
	 *     tags: [SupplierSettlement]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - supplierId
	 *               - amount
	 *             properties:
	 *               supplierId:
	 *                 type: string
	 *                 description: Supplier ID
	 *                 example: "507f1f77bcf86cd799439011"
	 *               amount:
	 *                 type: number
	 *                 description: Settlement amount
	 *                 example: 5000
	 *               referenceNo:
	 *                 type: string
	 *               notes:
	 *                 type: string
	 *     responses:
	 *       201:
	 *         description: Supplier settlement created successfully
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
	 *                         supplierSettlement:
	 *                           $ref: '#/components/schemas/SupplierSettlement'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/supplier-settlement/{id}/remittance:
	 *   post:
	 *     summary: Create supplier settlement remittance
	 *     description: |
	 *       Record a payment remittance for a supplier settlement.
	 *       Use multipart/form-data when uploading a receipt (image or PDF). File field name must be "receipt".
	 *     tags: [SupplierSettlement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Settlement ID (supplierSettlementId)
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - amount
	 *             properties:
	 *               amount:
	 *                 type: number
	 *                 description: Payment amount (number or string)
	 *               receipt:
	 *                 type: string
	 *                 format: binary
	 *                 description: Receipt image or PDF (optional)
	 *               receiptType:
	 *                 type: string
	 *                 enum: [OR, BANK_RECEIPT]
	 *               receiptNumber:
	 *                 type: string
	 *               referenceNo:
	 *                 type: string
	 *               notes:
	 *                 type: string
	 *               remittedAt:
	 *                 type: string
	 *                 format: date-time
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - amount
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
	 *     responses:
	 *       201:
	 *         description: Remittance created successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/remittance", uploadDisbursementReceipt, controller.createRemittance);

	/**
	 * @openapi
	 * /api/supplier-settlement/{id}:
	 *   patch:
	 *     summary: Update supplier settlement
	 *     description: Partial update of a supplier settlement. Accepts application/json or multipart/form-data.
	 *     tags: [SupplierSettlement]
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
	 *               amount:
	 *                 type: number
	 *               referenceNo:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Supplier settlement updated successfully
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
	 *                         supplierSettlement:
	 *                           $ref: '#/components/schemas/SupplierSettlement'
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
	 * /api/supplier-settlement/{id}:
	 *   delete:
	 *     summary: Delete supplier settlement
	 *     description: Permanently delete a supplier settlement by ID
	 *     tags: [SupplierSettlement]
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
	 *         description: Supplier settlement deleted successfully
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

	/**
	 * @openapi
	 * /api/supplier-settlement/{id}/reconcile:
	 *   post:
	 *     summary: Reconcile supplier settlement
	 *     description: Mark a supplier settlement as reconciled after verifying payment records
	 *     tags: [SupplierSettlement]
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
	 *         description: Supplier settlement reconciled successfully
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
	 *                         supplierSettlement:
	 *                           $ref: '#/components/schemas/SupplierSettlement'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/reconcile", controller.reconcile);

	// Top-level: GET /api/ledger/supplier/:supplierId?view=admin|supplier
	route.get(
		"/ledger/supplier/:supplierId",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:supplierSettlement:ledger:${req.params.supplierId}:${queryKey}`;
			},
		}),
		controller.getAdminToSupplierSoa,
	);

	route.use(path, routes);
	return route;
};
