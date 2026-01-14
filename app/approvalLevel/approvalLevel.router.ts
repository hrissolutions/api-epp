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
	const path = "/approvalLevel";

	/**
	 * @openapi
	 * /api/approvalLevel/{id}:
	 *   get:
	 *     summary: Get approval level by ID
	 *     description: Retrieve a specific approval level by its unique identifier
	 *     tags: [ApprovalLevel]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Approval Level ID
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include
	 *     responses:
	 *       200:
	 *         description: Approval level retrieved successfully
	 *       404:
	 *         description: Approval level not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:approvalLevel:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/approvalLevel:
	 *   get:
	 *     summary: Get all approval levels
	 *     description: Retrieve approval levels with filtering, pagination, and sorting
	 *     tags: [ApprovalLevel]
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
	 *         description: Approval levels retrieved successfully
	 *       500:
	 *         description: Internal server error
	 */
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:approvalLevel:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/approvalLevel:
	 *   post:
	 *     summary: Create new approval level
	 *     description: Create a new approval level for a workflow
	 *     tags: [ApprovalLevel]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - workflowId
	 *               - level
	 *               - role
	 *             properties:
	 *               workflowId:
	 *                 type: string
	 *               level:
	 *                 type: integer
	 *               role:
	 *                 type: string
	 *                 enum: [MANAGER, HR, FINANCE, DEPARTMENT_HEAD, ADMIN]
	 *               description:
	 *                 type: string
	 *               isRequired:
	 *                 type: boolean
	 *               autoApproveUnder:
	 *                 type: number
	 *               timeoutDays:
	 *                 type: integer
	 *     responses:
	 *       201:
	 *         description: Approval level created successfully
	 *       400:
	 *         description: Validation error
	 *       500:
	 *         description: Internal server error
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/approvalLevel/{id}:
	 *   patch:
	 *     summary: Update approval level
	 *     description: Update an approval level
	 *     tags: [ApprovalLevel]
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
	 *         description: Approval level updated successfully
	 *       404:
	 *         description: Approval level not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/approvalLevel/{id}:
	 *   delete:
	 *     summary: Delete approval level
	 *     description: Delete an approval level
	 *     tags: [ApprovalLevel]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Approval level deleted successfully
	 *       404:
	 *         description: Approval level not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.delete("/:id", controller.remove);

	route.use(path, routes);

	return route;
};
