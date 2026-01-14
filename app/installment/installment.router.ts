import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium, cacheUser } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	markAsDeducted(req: Request, res: Response, next: NextFunction): Promise<void>;
	getPendingForPayroll(req: Request, res: Response, next: NextFunction): Promise<void>;
	getOrderSummary(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/installment";

	/**
	 * @openapi
	 * /api/installment/{id}:
	 *   get:
	 *     summary: Get installment by ID
	 *     description: Retrieve a specific installment by its unique identifier with optional field selection
	 *     tags: [Installment]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Installment ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,name,description,type"
	 *     responses:
	 *       200:
	 *         description: Installment retrieved successfully
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
	 *                         installment:
	 *                           $ref: '#/components/schemas/Installment'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual installment with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:installment:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/installment:
	 *   get:
	 *     summary: Get all installments
	 *     description: Retrieve installments with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [Installment]
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
	 *         description: Field to sort by or JSON object for multi-field sorting
	 *         example: "createdAt"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports dot notation)
	 *         example: "id,name,description,type"
	 *       - in: query
	 *         name: query
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Search query to filter by name or description
	 *         example: "welcome email"
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects for advanced filtering
	 *         example: '[{"type":"email"},{"isDeleted":false}]'
	 *       - in: query
	 *         name: groupBy
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Group results by a field name
	 *         example: "type"
	 *       - in: query
	 *         name: document
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include installment documents in response
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
	 *         description: Templates retrieved successfully
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
	 *                         installments:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/Installment'
	 *                           description: Present when document="true" and no groupBy
	 *                         groups:
	 *                           type: object
	 *                           additionalProperties:
	 *                             type: array
	 *                             items:
	 *                               $ref: '#/components/schemas/Installment'
	 *                           description: Present when groupBy is used and document="true"
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
	// Cache installment list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:installment:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/installment:
	 *   post:
	 *     summary: Create new installment
	 *     description: Create a new installment with the provided data
	 *     tags: [Installment]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: Installment name
	 *                 example: "Email Welcome Installment"
	 *               description:
	 *                 type: string
	 *                 description: Installment description
	 *                 example: "Welcome email installment for new users"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: Installment type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 default: false
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *               isDeleted:
	 *                 type: boolean
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *               isDeleted:
	 *                 type: boolean
	 *     responses:
	 *       201:
	 *         description: Installment created successfully
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
	 *                         installment:
	 *                           $ref: '#/components/schemas/Installment'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/installment/{id}:
	 *   patch:
	 *     summary: Update installment
	 *     description: Update installment data by ID (partial update)
	 *     tags: [Installment]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Installment ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             minProperties: 1
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: Installment name
	 *                 example: "Updated Email Installment"
	 *               description:
	 *                 type: string
	 *                 description: Installment description
	 *                 example: "Updated description for the installment"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: Installment type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 example: false
	 *     responses:
	 *       200:
	 *         description: Installment updated successfully
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
	 *                         installment:
	 *                           $ref: '#/components/schemas/Installment'
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
	 * /api/installment/{id}:
	 *   delete:
	 *     summary: Delete installment
	 *     description: Permanently delete a installment by ID
	 *     tags: [Installment]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Installment ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Installment deleted successfully
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
	 * /api/installment/{id}/deduct:
	 *   post:
	 *     summary: Mark installment as deducted
	 *     description: Mark an installment as deducted from payroll with optional batch and reference tracking
	 *     tags: [Installment]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Installment ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               payrollBatchId:
	 *                 type: string
	 *                 description: Payroll batch identifier
	 *                 example: "BATCH-2024-01-15"
	 *               deductionReference:
	 *                 type: string
	 *                 description: Deduction reference number
	 *                 example: "DED-2024-001234"
	 *     responses:
	 *       200:
	 *         description: Installment marked as deducted successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/deduct", controller.markAsDeducted);

	/**
	 * @openapi
	 * /api/installment/pending-payroll:
	 *   get:
	 *     summary: Get pending installments for payroll
	 *     description: Retrieve all pending installments that are due for deduction based on cutoff date
	 *     tags: [Installment]
	 *     parameters:
	 *       - in: query
	 *         name: cutoffDate
	 *         required: false
	 *         schema:
	 *           type: string
	 *           format: date
	 *         description: Cutoff date for filtering (defaults to today)
	 *         example: "2024-01-15"
	 *     responses:
	 *       200:
	 *         description: Pending installments retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 cutoffDate:
	 *                   type: string
	 *                   format: date-time
	 *                 totalPending:
	 *                   type: integer
	 *                 totalAmount:
	 *                   type: number
	 *                 installments:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/Installment'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/pending-payroll", controller.getPendingForPayroll);

	/**
	 * @openapi
	 * /api/installment/order/{orderId}/summary:
	 *   get:
	 *     summary: Get installment summary for order
	 *     description: Retrieve a comprehensive summary of all installments for a specific order
	 *     tags: [Installment]
	 *     parameters:
	 *       - in: path
	 *         name: orderId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Order ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Installment summary retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 totalInstallments:
	 *                   type: integer
	 *                 paidCount:
	 *                   type: integer
	 *                 pendingCount:
	 *                   type: integer
	 *                 failedCount:
	 *                   type: integer
	 *                 totalAmount:
	 *                   type: number
	 *                 paidAmount:
	 *                   type: number
	 *                 remainingAmount:
	 *                   type: number
	 *                 installments:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/Installment'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/order/:orderId/summary", controller.getOrderSummary);

	route.use(path, routes);

	return route;
};
