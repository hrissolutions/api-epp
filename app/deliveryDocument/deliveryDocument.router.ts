import { Router, Request, Response, NextFunction } from "express";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	receive(req: Request, res: Response, next: NextFunction): Promise<void>;
	confirmReceipt(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/deliveryDocument";

	/**
	 * @openapi
	 * /api/deliveryDocument/{id}/receive:
	 *   post:
	 *     summary: Mark Supplier DO as received (creates Admin DR)
	 *     description: Admin acknowledges receipt of goods from supplier. Creates an Admin Delivery Receipt (VENDOR_TO_ADMIN). Mirrors the dispatch→confirm-receipt flow for Stage 1.
	 *     tags: [DeliveryDocument]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
	 *         description: Supplier DO ID
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               receiverName:      { type: string, nullable: true }
	 *               receiverSignature: { type: string, nullable: true }
	 *               conditionOfGoods:  { type: string, nullable: true }
	 *     responses:
	 *       201:
	 *         description: Admin Delivery Receipt created
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/receive", controller.receive);

	/**
	 * @openapi
	 * /api/deliveryDocument/{id}/confirm-receipt:
	 *   post:
	 *     summary: Confirm client receipt (creates Client DR)
	 *     description: Client or admin confirms delivery of goods to the client. Creates a Client Delivery Receipt (ADMIN_TO_CLIENT) linked to the Admin DO. Order status is synced to DELIVERED.
	 *     tags: [DeliveryDocument]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema: { type: string, pattern: '^[0-9a-fA-F]{24}$' }
	 *         description: Admin DO ID (ADMIN_TO_CLIENT delivery order)
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               receiverName:      { type: string, nullable: true }
	 *               receiverSignature: { type: string, nullable: true }
	 *               conditionOfGoods:  { type: string, nullable: true }
	 *     responses:
	 *       201:
	 *         description: Client Delivery Receipt created, order marked DELIVERED
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/confirm-receipt", controller.confirmReceipt);

	routes.get("/", controller.getAll);
	routes.get("/:id", controller.getById);
	routes.post("/", controller.create);
	routes.patch("/:id", controller.update);
	routes.delete("/:id", controller.remove);

	route.use(path, routes);
	return route;
};
