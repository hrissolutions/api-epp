import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	testReminder(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/notification";

	/**
	 * @openapi
	 * /api/notification/test-reminder:
	 *   get:
	 *     summary: Test booking dropoff reminder
	 *     description: Manually trigger the booking dropoff reminder cron job for testing purposes
	 *     tags: [Notification]
	 *     parameters:
	 *       - in: query
	 *         name: testTime
	 *         schema:
	 *           type: string
	 *           format: date-time
	 *         description: Optional custom time for testing (ISO 8601 format)
	 *     responses:
	 *       200:
	 *         description: Reminder test completed successfully
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get("/test-reminder", controller.testReminder);

	/**
	 * @openapi
	 * /api/notification/{id}:
	 *   get:
	 *     summary: Get notification by ID
	 *     description: Retrieve a specific notification by its unique identifier
	 *     tags: [Notification]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Notification ID (MongoDB ObjectId format)
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include
	 *     responses:
	 *       200:
	 *         description: Notification retrieved successfully
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
				return `cache:notification:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/notification:
	 *   get:
	 *     summary: Get all notifications
	 *     description: Retrieve notifications with advanced filtering, pagination, and sorting
	 *     tags: [Notification]
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
	 *         description: Notifications retrieved successfully
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
				return `cache:notification:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/notification:
	 *   post:
	 *     summary: Create new notification
	 *     description: Create a new notification
	 *     tags: [Notification]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - source
	 *               - category
	 *               - title
	 *               - description
	 *             properties:
	 *               source:
	 *                 type: string
	 *                 description: Source ID (MongoDB ObjectId)
	 *               category:
	 *                 type: string
	 *                 description: Notification category
	 *               title:
	 *                 type: string
	 *                 description: Notification title
	 *               description:
	 *                 type: string
	 *                 description: Notification description
	 *               recipients:
	 *                 type: object
	 *                 description: Recipients object with read and unread arrays
	 *                 properties:
	 *                   read:
	 *                     type: array
	 *                     items:
	 *                       type: object
	 *                       properties:
	 *                         user:
	 *                           type: string
	 *                         date:
	 *                           type: string
	 *                           format: date-time
	 *                   unread:
	 *                     type: array
	 *                     items:
	 *                       type: object
	 *                       properties:
	 *                         user:
	 *                           type: string
	 *                         date:
	 *                           type: string
	 *                           format: date-time
	 *               metadata:
	 *                 type: object
	 *                 description: Additional metadata
	 *               isDeleted:
	 *                 type: boolean
	 *                 default: false
	 *     responses:
	 *       201:
	 *         description: Notification created successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/notification/{id}:
	 *   patch:
	 *     summary: Update notification
	 *     description: Update notification data by ID
	 *     tags: [Notification]
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
	 *               category:
	 *                 type: string
	 *               title:
	 *                 type: string
	 *               description:
	 *                 type: string
	 *               recipients:
	 *                 type: object
	 *               metadata:
	 *                 type: object
	 *               isDeleted:
	 *                 type: boolean
	 *     responses:
	 *       200:
	 *         description: Notification updated successfully
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
	 * /api/notification/{id}:
	 *   delete:
	 *     summary: Delete notification
	 *     description: Permanently delete a notification by ID
	 *     tags: [Notification]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Notification deleted successfully
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
