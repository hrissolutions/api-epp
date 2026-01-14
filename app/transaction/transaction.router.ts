import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	reconcileTransaction(req: Request, res: Response, next: NextFunction): Promise<void>;
	getByOrder(req: Request, res: Response, next: NextFunction): Promise<void>;
	getByEmployee(req: Request, res: Response, next: NextFunction): Promise<void>;
	getUnreconciled(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/transaction";

	/**
	 * @openapi
	 * /api/transaction/unreconciled:
	 *   get:
	 *     summary: Get unreconciled transactions
	 *     description: Retrieve all completed transactions that haven't been reconciled yet
	 *     tags: [Transaction]
	 *     responses:
	 *       200:
	 *         description: Unreconciled transactions retrieved successfully
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/unreconciled", controller.getUnreconciled);

	/**
	 * @openapi
	 * /api/transaction/order/{orderId}:
	 *   get:
	 *     summary: Get transactions by order
	 *     description: Retrieve all transactions associated with a specific order
	 *     tags: [Transaction]
	 *     parameters:
	 *       - in: path
	 *         name: orderId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Order ID (MongoDB ObjectId format)
	 *     responses:
	 *       200:
	 *         description: Order transactions retrieved successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/order/:orderId", controller.getByOrder);

	/**
	 * @openapi
	 * /api/transaction/employee/{employeeId}:
	 *   get:
	 *     summary: Get transactions by employee
	 *     description: Retrieve all transactions for a specific employee
	 *     tags: [Transaction]
	 *     parameters:
	 *       - in: path
	 *         name: employeeId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Employee ID (MongoDB ObjectId format)
	 *     responses:
	 *       200:
	 *         description: Employee transactions retrieved successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/employee/:employeeId", controller.getByEmployee);

	/**
	 * @openapi
	 * /api/transaction/{id}:
	 *   get:
	 *     summary: Get transaction by ID
	 *     description: Retrieve a specific transaction by its unique identifier
	 *     tags: [Transaction]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Transaction ID (MongoDB ObjectId format)
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include
	 *     responses:
	 *       200:
	 *         description: Transaction retrieved successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:transaction:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/transaction:
	 *   get:
	 *     summary: Get all transactions
	 *     description: Retrieve transactions with advanced filtering, pagination, and sorting
	 *     tags: [Transaction]
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *       - in: query
	 *         name: order
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *           default: desc
	 *       - in: query
	 *         name: query
	 *         schema:
	 *           type: string
	 *         description: Search query
	 *       - in: query
	 *         name: filter
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects
	 *     responses:
	 *       200:
	 *         description: Transactions retrieved successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:transaction:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/transaction:
	 *   post:
	 *     summary: Create new transaction
	 *     description: Create a new payment transaction
	 *     tags: [Transaction]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - transactionNumber
	 *               - employeeId
	 *               - orderId
	 *               - type
	 *               - amount
	 *               - paymentMethod
	 *             properties:
	 *               transactionNumber:
	 *                 type: string
	 *               employeeId:
	 *                 type: string
	 *               orderId:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *                 enum: [PURCHASE, INSTALLMENT, POINTS_REDEMPTION, REFUND, ADJUSTMENT]
	 *               amount:
	 *                 type: number
	 *               paymentMethod:
	 *                 type: string
	 *                 enum: [CASH, INSTALLMENT, POINTS, MIXED]
	 *     responses:
	 *       201:
	 *         description: Transaction created successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/transaction/{id}:
	 *   patch:
	 *     summary: Update transaction
	 *     description: Update transaction data by ID
	 *     tags: [Transaction]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               status:
	 *                 type: string
	 *                 enum: [PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, REVERSED]
	 *               notes:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Transaction updated successfully
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
	 * /api/transaction/{id}:
	 *   delete:
	 *     summary: Delete transaction
	 *     description: Permanently delete a transaction by ID
	 *     tags: [Transaction]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Transaction deleted successfully
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
	 * /api/transaction/{id}/reconcile:
	 *   post:
	 *     summary: Reconcile transaction
	 *     description: Mark a transaction as reconciled
	 *     tags: [Transaction]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - reconciledBy
	 *             properties:
	 *               reconciledBy:
	 *                 type: string
	 *               notes:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Transaction reconciled successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/reconcile", controller.reconcileTransaction);

	route.use(path, routes);

	return route;
};
