import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	dispatch(req: Request, res: Response, next: NextFunction): Promise<void>;
	dispatchOrder(req: Request, res: Response, next: NextFunction): Promise<void>;
	receive(req: Request, res: Response, next: NextFunction): Promise<void>;
	confirmReceipt(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/deliveryDocument";

	/**
	 * @openapi
	 * /api/deliveryDocument/{purchaseOrderId}/dispatch:
	 *   post:
	 *     summary: Dispatch purchase order (creates Supplier DO)
	 *     description: Creates a Supplier Delivery Order (DO) from a confirmed Purchase Order. PO must be in CONFIRMED status. DO items, supplier info, and quantities are taken from the Purchase Order.
	 *     tags: [DeliveryDocument]
	 *     parameters:
	 *       - in: path
	 *         name: purchaseOrderId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Purchase Order ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       201:
	 *         description: Supplier Delivery Order created successfully
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
	 *                         deliveryOrder:
	 *                           $ref: '#/components/schemas/DeliveryDocument'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:purchaseOrderId/dispatch", controller.dispatch);

	/**
	 * @openapi
	 * /api/deliveryDocument/{orderId}/dispatch-to-client:
	 *   post:
	 *     summary: Dispatch order to client (creates Admin DO)
	 *     description: Creates an Admin Delivery Order (DO) for dispatching an approved/processing order to the client. Order must be APPROVED or PROCESSING.
	 *     tags: [DeliveryDocument]
	 *     parameters:
	 *       - in: path
	 *         name: orderId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Order ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               trackingNumber:            { type: string, nullable: true }
	 *               expectedDeliveryDate:      { type: string, format: date-time, nullable: true }
	 *               expectedDeliveryTime:      { type: string, nullable: true }
	 *               internalDeliveryPersonnel: { type: string, nullable: true }
	 *               carrierInfo:               { type: string, nullable: true }
	 *               toName:                    { type: string, nullable: true }
	 *               toAddress:                 { type: string, nullable: true }
	 *               clientUserId:              { type: string, nullable: true }
	 *     responses:
	 *       201:
	 *         description: Admin Delivery Order created successfully
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
	 *                         deliveryOrder:
	 *                           $ref: '#/components/schemas/DeliveryDocument'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:orderId/dispatch-to-client", controller.dispatchOrder);

	/**
	 * @openapi
	 * /api/deliveryDocument/{id}/receive:
	 *   post:
	 *     summary: Mark Supplier DO as received (creates Admin DR)
	 *     description: Admin acknowledges receipt of goods from supplier. Creates an Admin Delivery Receipt (VENDOR_TO_ADMIN).
	 *     tags: [DeliveryDocument]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Supplier DO ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               receiverName:
	 *                 type: string
	 *                 nullable: true
	 *               receiverSignature:
	 *                 type: string
	 *                 nullable: true
	 *               conditionOfGoods:
	 *                 type: string
	 *                 nullable: true
	 *     responses:
	 *       201:
	 *         description: Admin Delivery Receipt created successfully
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
	 *                         deliveryReceipt:
	 *                           $ref: '#/components/schemas/DeliveryDocument'
	 *                         documentNumber:
	 *                           type: string
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
	 *     description: Client or admin confirms delivery of goods to the client. Creates a Client Delivery Receipt (ADMIN_TO_CLIENT). Order status is synced to DELIVERED.
	 *     tags: [DeliveryDocument]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Admin DO ID (ADMIN_TO_CLIENT delivery order)
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               receiverName:
	 *                 type: string
	 *                 nullable: true
	 *               receiverSignature:
	 *                 type: string
	 *                 nullable: true
	 *               conditionOfGoods:
	 *                 type: string
	 *                 nullable: true
	 *     responses:
	 *       201:
	 *         description: Client Delivery Receipt created, order marked DELIVERED
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
	 *                         deliveryReceipt:
	 *                           $ref: '#/components/schemas/DeliveryDocument'
	 *                         documentNumber:
	 *                           type: string
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/:id/confirm-receipt", controller.confirmReceipt);

	/**
	 * @openapi
	 * /api/deliveryDocument/{id}:
	 *   get:
	 *     summary: Get delivery document by ID
	 *     description: Retrieve a specific delivery document by its unique identifier, including linked DO/DR relationships
	 *     tags: [DeliveryDocument]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Delivery Document ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports dot notation)
	 *         example: "id,documentNumber,documentType,transferStage"
	 *     responses:
	 *       200:
	 *         description: Delivery document retrieved successfully
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
	 *                         deliveryDocument:
	 *                           $ref: '#/components/schemas/DeliveryDocument'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual delivery document with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:deliveryDocument:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/deliveryDocument:
	 *   get:
	 *     summary: Get all delivery documents
	 *     description: Retrieve delivery documents with filtering by orderId, purchaseOrderId, documentType, and transferStage
	 *     tags: [DeliveryDocument]
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
	 *         name: orderId
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Filter by linked order ID
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: purchaseOrderId
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Filter by linked purchase order ID
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: documentType
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [DELIVERY_ORDER, DELIVERY_RECEIPT]
	 *         description: Filter by document type
	 *         example: "DELIVERY_ORDER"
	 *       - in: query
	 *         name: transferStage
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [VENDOR_TO_ADMIN, ADMIN_TO_CLIENT]
	 *         description: Filter by transfer stage
	 *         example: "ADMIN_TO_CLIENT"
	 *     responses:
	 *       200:
	 *         description: Delivery documents retrieved successfully
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
	 *                         deliveryDocuments:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/DeliveryDocument'
	 *                         count:
	 *                           type: integer
	 *                         pagination:
	 *                           $ref: '#/components/schemas/Pagination'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache delivery document list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:deliveryDocument:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/deliveryDocument:
	 *   post:
	 *     summary: Create delivery document
	 *     description: Manually create a delivery document (DO or DR) with full control over all fields
	 *     tags: [DeliveryDocument]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - documentType
	 *               - transferStage
	 *               - fromParty
	 *               - toParty
	 *               - documentNumber
	 *               - documentDate
	 *               - items
	 *             properties:
	 *               documentType:
	 *                 type: string
	 *                 enum: [DELIVERY_ORDER, DELIVERY_RECEIPT]
	 *                 example: "DELIVERY_ORDER"
	 *               transferStage:
	 *                 type: string
	 *                 enum: [VENDOR_TO_ADMIN, ADMIN_TO_CLIENT]
	 *                 example: "ADMIN_TO_CLIENT"
	 *               fromParty:
	 *                 type: string
	 *                 example: "ADMIN"
	 *               toParty:
	 *                 type: string
	 *                 example: "CLIENT"
	 *               documentNumber:
	 *                 type: string
	 *                 example: "DO-A-20240101-A0001"
	 *               documentDate:
	 *                 type: string
	 *                 format: date-time
	 *               orderId:
	 *                 type: string
	 *                 nullable: true
	 *               supplierId:
	 *                 type: string
	 *                 nullable: true
	 *               items:
	 *                 type: array
	 *                 items:
	 *                   type: object
	 *                   properties:
	 *                     sku:
	 *                       type: string
	 *                     quantity:
	 *                       type: number
	 *     responses:
	 *       201:
	 *         description: Delivery document created successfully
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
	 *                         deliveryDocument:
	 *                           $ref: '#/components/schemas/DeliveryDocument'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/deliveryDocument/{id}:
	 *   patch:
	 *     summary: Update delivery document
	 *     description: Update delivery document data by ID (partial update)
	 *     tags: [DeliveryDocument]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Delivery Document ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             minProperties: 1
	 *             properties:
	 *               receiverName:
	 *                 type: string
	 *               receiverSignature:
	 *                 type: string
	 *               conditionOfGoods:
	 *                 type: string
	 *               trackingNumber:
	 *                 type: string
	 *               carrierInfo:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Delivery document updated successfully
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
	 *                         deliveryDocument:
	 *                           $ref: '#/components/schemas/DeliveryDocument'
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
	 * /api/deliveryDocument/{id}:
	 *   delete:
	 *     summary: Delete delivery document
	 *     description: Permanently delete a delivery document by ID
	 *     tags: [DeliveryDocument]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Delivery Document ID
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Delivery document deleted successfully
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

	route.use(path, routes);
	return route;
};
