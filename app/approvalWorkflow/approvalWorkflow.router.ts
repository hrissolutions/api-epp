import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/approvalWorkflow";

	/**
	 * @openapi
	 * /api/approvalWorkflow/{id}:
	 *   get:
	 *     summary: Get approval workflow by ID
	 *     description: Retrieve a specific approval workflow by its unique identifier
	 *     tags: [ApprovalWorkflow]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Approval Workflow ID
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include
	 *     responses:
	 *       200:
	 *         description: Approval workflow retrieved successfully
	 *       404:
	 *         description: Approval workflow not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:approvalWorkflow:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/approvalWorkflow:
	 *   get:
	 *     summary: Get all approval workflows
	 *     description: Retrieve approval workflows with filtering, pagination, and sorting
	 *     tags: [ApprovalWorkflow]
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
	 *         description: Approval workflows retrieved successfully
	 *       500:
	 *         description: Internal server error
	 */
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:approvalWorkflow:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/approvalWorkflow:
	 *   post:
	 *     summary: Create new approval workflow
	 *     description: Create a new approval workflow
	 *     tags: [ApprovalWorkflow]
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
	 *               description:
	 *                 type: string
	 *               isActive:
	 *                 type: boolean
	 *               minOrderAmount:
	 *                 type: number
	 *               maxOrderAmount:
	 *                 type: number
	 *               requiresInstallment:
	 *                 type: boolean
	 *     responses:
	 *       201:
	 *         description: Approval workflow created successfully
	 *       400:
	 *         description: Validation error
	 *       500:
	 *         description: Internal server error
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/approvalWorkflow/{id}:
	 *   patch:
	 *     summary: Update approval workflow
	 *     description: Update an approval workflow
	 *     tags: [ApprovalWorkflow]
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
	 *         description: Approval workflow updated successfully
	 *       404:
	 *         description: Approval workflow not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/approvalWorkflow/{id}:
	 *   delete:
	 *     summary: Delete approval workflow
	 *     description: Delete an approval workflow
	 *     tags: [ApprovalWorkflow]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Approval workflow deleted successfully
	 *       404:
	 *         description: Approval workflow not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.delete("/:id", controller.remove);

	route.use(path, routes);

	return route;
};
