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
	const path = "/workflowApprovalLevel";

	/**
	 * @openapi
	 * /api/workflowApprovalLevel/{id}:
	 *   get:
	 *     summary: Get workflow approval level by ID
	 *     description: Retrieve a specific workflow approval level by its unique identifier
	 *     tags: [WorkflowApprovalLevel]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Workflow Approval Level ID
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include
	 *     responses:
	 *       200:
	 *         description: Workflow approval level retrieved successfully
	 *       404:
	 *         description: Workflow approval level not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:workflowApprovalLevel:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/workflowApprovalLevel:
	 *   get:
	 *     summary: Get all workflow approval levels
	 *     description: Retrieve workflow approval levels with filtering, pagination, and sorting
	 *     tags: [WorkflowApprovalLevel]
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
	 *         description: Workflow approval levels retrieved successfully
	 *       500:
	 *         description: Internal server error
	 */
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:workflowApprovalLevel:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/workflowApprovalLevel:
	 *   post:
	 *     summary: Create new workflow approval level
	 *     description: Create a new workflow approval level linking a workflow to an approval level
	 *     tags: [WorkflowApprovalLevel]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - workflowId
	 *               - approvalLevelId
	 *               - level
	 *             properties:
	 *               workflowId:
	 *                 type: string
	 *               approvalLevelId:
	 *                 type: string
	 *               level:
	 *                 type: integer
	 *     responses:
	 *       201:
	 *         description: Workflow approval level created successfully
	 *       400:
	 *         description: Validation error
	 *       500:
	 *         description: Internal server error
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/workflowApprovalLevel/{id}:
	 *   patch:
	 *     summary: Update workflow approval level
	 *     description: Update a workflow approval level
	 *     tags: [WorkflowApprovalLevel]
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
	 *         description: Workflow approval level updated successfully
	 *       404:
	 *         description: Workflow approval level not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/workflowApprovalLevel/{id}:
	 *   delete:
	 *     summary: Delete workflow approval level
	 *     description: Delete a workflow approval level
	 *     tags: [WorkflowApprovalLevel]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Workflow approval level deleted successfully
	 *       404:
	 *         description: Workflow approval level not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.delete("/:id", controller.remove);

	route.use(path, routes);

	return route;
};
