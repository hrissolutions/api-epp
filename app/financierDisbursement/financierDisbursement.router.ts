import { Router, Request, Response, NextFunction } from "express";
import { uploadDisbursementReceipt } from "../../middleware/upload";
import { cache } from "../../middleware/cache";

interface IController {
	getLedger(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAdminToFinancierSoa(req: Request, res: Response, next: NextFunction): Promise<void>;
	getFinancierSoa(req: Request, res: Response, next: NextFunction): Promise<void>;
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getRemittances(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	createRemittance(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	reconcile(req: Request, res: Response, next: NextFunction): Promise<void>;
	uploadReceipt(req: Request, res: Response, next: NextFunction): Promise<void>;
	uploadRemittanceReceipt(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (_route: Router, controller: IController): Router => {
	const route = _route;
	const routes = Router();
	const path = "/financier-disbursement";

	/**
	 * @openapi
	 * /api/financier-disbursement/ledger/admin:
	 *   get:
	 *     summary: Get admin-to-financier SOA (all financiers)
	 *     description: Retrieve the consolidated admin-to-financier statement of account across all financier configurations
	 *     tags: [FinancierDisbursement]
	 *     parameters:
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
	 *         description: Admin SOA retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Success'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/ledger/admin",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:ledger:admin:${queryKey}`;
			},
		}),
		controller.getAdminToFinancierSoa,
	);

	/**
	 * @openapi
	 * /api/financier-disbursement/ledger/{financierConfigId}:
	 *   get:
	 *     summary: Get financier disbursement ledger
	 *     description: Retrieve the full disbursement ledger for a specific financier configuration
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: financierConfigId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Financier Config ID
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: startDate
	 *         required: false
	 *         schema:
	 *           type: string
	 *           format: date
	 *       - in: query
	 *         name: endDate
	 *         required: false
	 *         schema:
	 *           type: string
	 *           format: date
	 *     responses:
	 *       200:
	 *         description: Ledger retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Success'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/ledger/:financierConfigId",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:ledger:${req.params.financierConfigId}:${queryKey}`;
			},
		}),
		controller.getLedger,
	);

	/**
	 * @openapi
	 * /api/financier-disbursement/ledger/admin/{financierConfigId}:
	 *   get:
	 *     summary: Get admin-to-financier SOA by financier
	 *     description: Retrieve the admin-to-financier statement of account for a specific financier configuration
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: financierConfigId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Financier Config ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Admin-to-financier SOA retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Success'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/ledger/admin/:financierConfigId",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:ledger:adminToFinancier:${req.params.financierConfigId}:${queryKey}`;
			},
		}),
		controller.getAdminToFinancierSoa,
	);

	/**
	 * @openapi
	 * /api/financier-disbursement/ledger/admin-to-financier/{financierConfigId}:
	 *   get:
	 *     summary: Get admin-to-financier SOA (canonical path)
	 *     description: Canonical path for retrieving the admin-to-financier statement of account for a specific financier
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: financierConfigId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Financier Config ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: SOA retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Success'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/ledger/admin-to-financier/:financierConfigId",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:ledger:adminToFinancier:${req.params.financierConfigId}:${queryKey}`;
			},
		}),
		controller.getAdminToFinancierSoa,
	);

	/**
	 * @openapi
	 * /api/financier-disbursement/ledger/financier/{financierConfigId}:
	 *   get:
	 *     summary: Get financier SOA (financier perspective)
	 *     description: Retrieve the financier-perspective statement of account for a specific financier configuration
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: financierConfigId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Financier Config ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Financier SOA retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Success'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/ledger/financier/:financierConfigId",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:ledger:financier:${req.params.financierConfigId}:${queryKey}`;
			},
		}),
		controller.getFinancierSoa,
	);

	// Backward-compatible SOA aliases.
	routes.get(
		"/soa/admin-to-financier/:financierConfigId",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:ledger:adminToFinancier:${req.params.financierConfigId}:${queryKey}`;
			},
		}),
		controller.getAdminToFinancierSoa,
	);

	routes.get(
		"/soa/financier/:financierConfigId",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:ledger:financier:${req.params.financierConfigId}:${queryKey}`;
			},
		}),
		controller.getFinancierSoa,
	);

	/**
	 * @openapi
	 * /api/financier-disbursement/{id}/remittances:
	 *   get:
	 *     summary: Get remittances for a financier disbursement
	 *     description: Retrieve all remittance records linked to a specific financier disbursement
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Financier Disbursement ID
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: page
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *       - in: query
	 *         name: limit
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *     responses:
	 *       200:
	 *         description: Remittances retrieved successfully
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
	 *                         remittances:
	 *                           type: array
	 *                           items:
	 *                             type: object
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/:id/remittances",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:remittances:${req.params.id}:${queryKey}`;
			},
		}),
		controller.getRemittances,
	);

	/**
	 * @openapi
	 * /api/financier-disbursement/{id}:
	 *   get:
	 *     summary: Get financier disbursement by ID
	 *     description: Retrieve a specific financier disbursement record by its unique identifier
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Financier Disbursement ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports dot notation)
	 *         example: "id,amount,financierConfigId,status"
	 *     responses:
	 *       200:
	 *         description: Financier disbursement retrieved successfully
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
	 *                         financierDisbursement:
	 *                           $ref: '#/components/schemas/FinancierDisbursement'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual financier disbursement with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:financierDisbursement:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/financier-disbursement:
	 *   get:
	 *     summary: Get all financier disbursements
	 *     description: Retrieve financier disbursement records with filtering, pagination, sorting, and field selection
	 *     tags: [FinancierDisbursement]
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
	 *         example: "id,amount,financierConfigId,status"
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects for advanced filtering
	 *         example: '[{"financierConfigId":"507f1f77bcf86cd799439011"}]'
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
	 *         description: Include disbursement documents in response
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
	 *         description: Financier disbursements retrieved successfully
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
	 *                         financierDisbursements:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/FinancierDisbursement'
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
	// Cache financier disbursement list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/financier-disbursement:
	 *   post:
	 *     summary: Create financier disbursement
	 *     description: Create a new financier disbursement record
	 *     tags: [FinancierDisbursement]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - financierConfigId
	 *               - amount
	 *             properties:
	 *               financierConfigId:
	 *                 type: string
	 *                 description: Financier configuration ID
	 *                 example: "507f1f77bcf86cd799439011"
	 *               amount:
	 *                 type: number
	 *                 description: Disbursement amount
	 *                 example: 10000
	 *               referenceNo:
	 *                 type: string
	 *               notes:
	 *                 type: string
	 *     responses:
	 *       201:
	 *         description: Financier disbursement created successfully
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
	 *                         financierDisbursement:
	 *                           $ref: '#/components/schemas/FinancierDisbursement'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/financier-disbursement/remittances/{remittanceId}/upload-receipt:
	 *   patch:
	 *     summary: Upload remittance receipt
	 *     description: Upload a receipt file (image/PDF) for a remittance record. Uploaded to Cloudinary and URL saved.
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: remittanceId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Remittance ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - receipt
	 *             properties:
	 *               receipt:
	 *                 type: string
	 *                 format: binary
	 *               receiptType:
	 *                 type: string
	 *                 enum: [OR, BANK_RECEIPT]
	 *               receiptNumber:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Receipt uploaded successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Success'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch(
		"/remittances/:remittanceId/upload-receipt",
		uploadDisbursementReceipt,
		controller.uploadRemittanceReceipt,
	);

	/**
	 * @openapi
	 * /api/financier-disbursement/{id}/remittance:
	 *   post:
	 *     summary: Create financier disbursement remittance
	 *     description: Record a payment remittance for a financier disbursement. Optional file "receipt" uploads to Cloudinary.
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Financier Disbursement ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
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
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               amount:
	 *                 type: number
	 *               receipt:
	 *                 type: string
	 *                 format: binary
	 *               receiptType:
	 *                 type: string
	 *                 enum: [OR, BANK_RECEIPT]
	 *     responses:
	 *       201:
	 *         description: Remittance created successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Success'
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
	 * /api/financier-disbursement/{id}:
	 *   patch:
	 *     summary: Update financier disbursement
	 *     description: Partial update of a financier disbursement record
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Financier Disbursement ID
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
	 *     responses:
	 *       200:
	 *         description: Financier disbursement updated successfully
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
	 *                         financierDisbursement:
	 *                           $ref: '#/components/schemas/FinancierDisbursement'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/financier-disbursement/{id}/upload-receipt:
	 *   patch:
	 *     summary: Upload disbursement receipt
	 *     description: Upload a receipt file (image/PDF) for a financier disbursement. Uploaded to Cloudinary and URL saved.
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Financier Disbursement ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - receipt
	 *             properties:
	 *               receipt:
	 *                 type: string
	 *                 format: binary
	 *               receiptType:
	 *                 type: string
	 *                 enum: [OR, BANK_RECEIPT]
	 *               receiptNumber:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Receipt uploaded and URL saved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Success'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id/upload-receipt", uploadDisbursementReceipt, controller.uploadReceipt);

	/**
	 * @openapi
	 * /api/financier-disbursement/{id}:
	 *   delete:
	 *     summary: Delete financier disbursement
	 *     description: Permanently delete a financier disbursement by ID
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Financier Disbursement ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Financier disbursement deleted successfully
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
	 * /api/financier-disbursement/{id}/reconcile:
	 *   post:
	 *     summary: Reconcile financier disbursement
	 *     description: Mark a financier disbursement as reconciled after verifying payment records
	 *     tags: [FinancierDisbursement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Financier Disbursement ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Financier disbursement reconciled successfully
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
	 *                         financierDisbursement:
	 *                           $ref: '#/components/schemas/FinancierDisbursement'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/reconcile", controller.reconcile);

	// Top-level ledger aliases without /financier-disbursement prefix.
	route.get(
		"/ledger/admin",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:ledger:admin:${queryKey}`;
			},
		}),
		controller.getAdminToFinancierSoa,
	);

	route.get(
		"/ledger/:financierConfigId",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:ledger:${req.params.financierConfigId}:${queryKey}`;
			},
		}),
		controller.getLedger,
	);

	route.get(
		"/ledger/admin/:financierConfigId",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:ledger:adminToFinancier:${req.params.financierConfigId}:${queryKey}`;
			},
		}),
		controller.getAdminToFinancierSoa,
	);

	route.get(
		"/ledger/financier/:financierConfigId",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:financierDisbursement:ledger:financier:${req.params.financierConfigId}:${queryKey}`;
			},
		}),
		controller.getFinancierSoa,
	);

	route.use(path, routes);
	return route;
};
