import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium, cacheUser } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	checkout(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/cartItem";

	/**
	 * @openapi
	 * /api/cartItem/{id}:
	 *   get:
	 *     summary: Get cartItem by ID
	 *     description: Retrieve a specific cartItem by its unique identifier with optional field selection
	 *     tags: [CartItem]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: CartItem ID (MongoDB ObjectId format)
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
	 *         description: CartItem retrieved successfully
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
	 *                         cartItem:
	 *                           $ref: '#/components/schemas/CartItem'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual cartItem with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:cartItem:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/cartItem:
	 *   get:
	 *     summary: Get all cartItems
	 *     description: Retrieve cartItems with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [CartItem]
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
	 *         description: Include cartItem documents in response
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
	 *                         cartItems:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/CartItem'
	 *                           description: Present when document="true" and no groupBy
	 *                         groups:
	 *                           type: object
	 *                           additionalProperties:
	 *                             type: array
	 *                             items:
	 *                               $ref: '#/components/schemas/CartItem'
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
	// Cache cartItem list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:cartItem:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/cartItem:
	 *   post:
	 *     summary: Create new cartItem
	 *     description: Create a new cartItem with the provided data
	 *     tags: [CartItem]
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
	 *                 description: CartItem name
	 *                 example: "Email Welcome CartItem"
	 *               description:
	 *                 type: string
	 *                 description: CartItem description
	 *                 example: "Welcome email cartItem for new users"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: CartItem type for categorization
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
	 *         description: CartItem created successfully
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
	 *                         cartItem:
	 *                           $ref: '#/components/schemas/CartItem'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/cartItem/{id}:
	 *   patch:
	 *     summary: Update cartItem
	 *     description: Update cartItem data by ID (partial update)
	 *     tags: [CartItem]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: CartItem ID (MongoDB ObjectId format)
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
	 *                 description: CartItem name
	 *                 example: "Updated Email CartItem"
	 *               description:
	 *                 type: string
	 *                 description: CartItem description
	 *                 example: "Updated description for the cartItem"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: CartItem type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 example: false
	 *     responses:
	 *       200:
	 *         description: CartItem updated successfully
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
	 *                         cartItem:
	 *                           $ref: '#/components/schemas/CartItem'
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
	 * /api/cartItem/{id}:
	 *   delete:
	 *     summary: Delete cartItem
	 *     description: Permanently delete a cartItem by ID
	 *     tags: [CartItem]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: CartItem ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: CartItem deleted successfully
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
	 * /api/cartItem/checkout:
	 *   post:
	 *     summary: Checkout cart items to create an order
	 *     description: Convert cart items for an employee into an order with optional installment payment. If items array is provided, only those specific items will be checked out. Otherwise, all cart items will be checked out. Calculates totals, creates order items, generates installments if payment type is INSTALLMENT, and clears only the checked-out items from the cart.
	 *     tags: [CartItem]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - employeeId
	 *             properties:
	 *               employeeId:
	 *                 type: string
	 *                 description: Employee ID who owns the cart
	 *                 example: "507f1f77bcf86cd799439011"
	 *               items:
	 *                 type: array
	 *                 description: Optional array of specific items to checkout. If not provided, all cart items will be checked out.
	 *                 items:
	 *                   type: object
	 *                   required:
	 *                     - productId
	 *                     - quantity
	 *                   properties:
	 *                     productId:
	 *                       type: string
	 *                       description: Product ID to checkout
	 *                       example: "696da7163ff7642054c61734"
	 *                     quantity:
	 *                       type: integer
	 *                       minimum: 1
	 *                       description: Quantity to checkout (must not exceed quantity in cart)
	 *                       example: 2
	 *                 example:
	 *                   - productId: "696da7163ff7642054c61734"
	 *                     quantity: 2
	 *               paymentType:
	 *                 type: string
	 *                 enum: [CASH, INSTALLMENT, POINTS, MIXED]
	 *                 default: INSTALLMENT
	 *                 description: Payment type for the order
	 *                 example: "INSTALLMENT"
	 *               installmentMonths:
	 *                 type: integer
	 *                 minimum: 1
	 *                 description: Number of months for installment plan (required if paymentType is INSTALLMENT)
	 *                 example: 6
	 *               paymentMethod:
	 *                 type: string
	 *                 enum: [PAYROLL_DEDUCTION, CASH, CREDIT_CARD, DEBIT_CARD, BANK_TRANSFER, OTHER]
	 *                 default: PAYROLL_DEDUCTION
	 *                 description: Payment method
	 *                 example: "PAYROLL_DEDUCTION"
	 *               discount:
	 *                 type: number
	 *                 minimum: 0
	 *                 default: 0
	 *                 description: Discount amount
	 *                 example: 0
	 *               tax:
	 *                 type: number
	 *                 minimum: 0
	 *                 default: 0
	 *                 description: Tax amount
	 *                 example: 0
	 *               pointsUsed:
	 *                 type: number
	 *                 minimum: 0
	 *                 description: Points used for payment
	 *                 example: 0
	 *               notes:
	 *                 type: string
	 *                 description: Additional notes for the order
	 *                 example: "Order placed via API"
	 *     responses:
	 *       201:
	 *         description: Order created successfully from cart
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
	 *                         order:
	 *                           $ref: '#/components/schemas/Order'
	 *                         transaction:
	 *                           type: object
	 *                           description: Transaction ledger information
	 *                         installments:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/Installment'
	 *                           description: Present when paymentType is INSTALLMENT
	 *                         installmentSummary:
	 *                           type: object
	 *                           description: Summary of installments (present when paymentType is INSTALLMENT)
	 *                         approvalWorkflow:
	 *                           type: object
	 *                           description: Approval workflow information
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/checkout", controller.checkout);

	route.use(path, routes);

	return route;
};
