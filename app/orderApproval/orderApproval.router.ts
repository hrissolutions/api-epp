import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	approve(req: Request, res: Response, next: NextFunction): Promise<void>;
	reject(req: Request, res: Response, next: NextFunction): Promise<void>;
	getApprovalSummary(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/orderApproval";

	/**
	 * @openapi
	 * /api/orderApproval/{id}:
	 *   get:
	 *     summary: Get order approval by ID
	 *     description: Retrieve a specific order approval by its unique identifier
	 *     tags: [OrderApproval]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Order Approval ID
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include
	 *     responses:
	 *       200:
	 *         description: Order approval retrieved successfully
	 *       404:
	 *         description: Order approval not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:orderApproval:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/orderApproval:
	 *   get:
	 *     summary: Get all order approvals
	 *     description: Retrieve order approvals with filtering, pagination, and sorting
	 *     tags: [OrderApproval]
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *           default: 1
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           default: 10
	 *       - in: query
	 *         name: query
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: filter
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Order approvals retrieved successfully
	 *       500:
	 *         description: Internal server error
	 */
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:orderApproval:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/orderApproval:
	 *   post:
	 *     summary: Create new order approval
	 *     description: Create a new order approval record
	 *     tags: [OrderApproval]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - orderId
	 *               - approvalLevel
	 *               - approverRole
	 *               - approverId
	 *               - approverName
	 *               - approverEmail
	 *             properties:
	 *               orderId:
	 *                 type: string
	 *               approvalLevel:
	 *                 type: integer
	 *               approverRole:
	 *                 type: string
	 *                 enum: [MANAGER, HR, FINANCE, DEPARTMENT_HEAD, ADMIN]
	 *               approverId:
	 *                 type: string
	 *               approverName:
	 *                 type: string
	 *               approverEmail:
	 *                 type: string
	 *     responses:
	 *       201:
	 *         description: Order approval created successfully
	 *       400:
	 *         description: Validation error
	 *       500:
	 *         description: Internal server error
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/orderApproval/{id}:
	 *   patch:
	 *     summary: Update order approval
	 *     description: Update an order approval record
	 *     tags: [OrderApproval]
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
	 *     responses:
	 *       200:
	 *         description: Order approval updated successfully
	 *       404:
	 *         description: Order approval not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/orderApproval/{id}:
	 *   delete:
	 *     summary: Delete order approval
	 *     description: Delete an order approval record
	 *     tags: [OrderApproval]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Order approval deleted successfully
	 *       404:
	 *         description: Order approval not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.delete("/:id", controller.remove);

	/**
	 * @openapi
	 * /api/orderApproval/{id}/approve:
	 *   post:
	 *     summary: Approve an order approval
	 *     description: Approve an order approval and advance to next level or complete order
	 *     tags: [OrderApproval]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Order Approval ID
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               comments:
	 *                 type: string
	 *                 description: Optional approval comments
	 *     responses:
	 *       200:
	 *         description: Order approval approved successfully
	 *       404:
	 *         description: Order approval not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.post("/:id/approve", controller.approve);

	/**
	 * @openapi
	 * /api/orderApproval/{id}/reject:
	 *   post:
	 *     summary: Reject an order approval
	 *     description: Reject an order approval and update order status to rejected
	 *     tags: [OrderApproval]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Order Approval ID
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - comments
	 *             properties:
	 *               comments:
	 *                 type: string
	 *                 description: Reason for rejection (required)
	 *     responses:
	 *       200:
	 *         description: Order approval rejected successfully
	 *       400:
	 *         description: Rejection reason required
	 *       404:
	 *         description: Order approval not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.post("/:id/reject", controller.reject);

	/**
	 * @openapi
	 * /api/orderApproval/summary/{orderId}:
	 *   get:
	 *     summary: Get approval summary for an order
	 *     description: Get a summary of all approvals for an order including count of approved approvers and their details
	 *     tags: [OrderApproval]
	 *     parameters:
	 *       - in: path
	 *         name: orderId
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Order ID to get approval summary for
	 *     responses:
	 *       200:
	 *         description: Approval summary retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     orderId:
	 *                       type: string
	 *                     orderNumber:
	 *                       type: string
	 *                     approvalSummary:
	 *                       type: object
	 *                       properties:
	 *                         totalRequired:
	 *                           type: integer
	 *                         approvedCount:
	 *                           type: integer
	 *                         pendingCount:
	 *                           type: integer
	 *                         progress:
	 *                           type: string
	 *                         percentageComplete:
	 *                           type: integer
	 *                     approvedApprovers:
	 *                       type: array
	 *                       items:
	 *                         type: object
	 *       404:
	 *         description: Order not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/summary/:orderId", controller.getApprovalSummary);

	route.use(path, routes);

	return route;
};
