import { Router, Request, Response, NextFunction } from "express";
import { uploadDisbursementReceipt } from "../../middleware/upload";

interface IController {
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (_route: Router, controller: IController): Router => {
	const route = _route;
	const routes = Router();
	const path = "/admin-financier-settlement";

	/**
	 * @openapi
	 * /api/admin-financier-settlement:
	 *   get:
	 *     summary: List admin financier settlements (remittances)
	 *     description: |
	 *       Retrieve admin-to-financier remittances with filter, sort, pagination, and field selection.
	 *       At least one of document, pagination, or count must be true.
	 *       Pagination requires document=true.
	 *     tags: [AdminFinancierSettlement]
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema: { type: integer, minimum: 1, default: 1 }
	 *         description: Page number
	 *       - in: query
	 *         name: limit
	 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
	 *         description: Items per page
	 *       - in: query
	 *         name: order
	 *         schema: { type: string, enum: [asc, desc], default: desc }
	 *         description: Sort order
	 *       - in: query
	 *         name: sort
	 *         schema: { type: string }
	 *         description: Field to sort by (e.g. createdAt, amount)
	 *       - in: query
	 *         name: fields
	 *         schema: { type: string }
	 *         description: Comma-separated fields (supports dot notation)
	 *       - in: query
	 *         name: filter
	 *         schema: { type: string }
	 *         description: Filter conditions as key:value,key:value
	 *       - in: query
	 *         name: query
	 *         schema: { type: string }
	 *         description: Search in referenceNo, notes, receiptNumber
	 *       - in: query
	 *         name: groupBy
	 *         schema: { type: string }
	 *         description: Group results by field (requires document=true)
	 *       - in: query
	 *         name: document
	 *         schema: { type: string, enum: ["true", "false"] }
	 *         description: Include settlement documents in response. At least one of document, pagination, or count must be true.
	 *       - in: query
	 *         name: pagination
	 *         schema: { type: string, enum: ["true", "false"] }
	 *         description: Include pagination metadata (requires document=true)
	 *       - in: query
	 *         name: count
	 *         schema: { type: string, enum: ["true", "false"] }
	 *         description: Include total count
	 *     responses:
	 *       200:
	 *         description: Admin financier settlements retrieved
	 *       400:
	 *         description: Validation error (e.g. all flags false or invalid params)
	 *       500:
	 *         description: Internal server error
	 */
	routes.get("/", controller.getAll);

	/**
	 * @openapi
	 * /api/admin-financier-settlement/{id}:
	 *   get:
	 *     summary: Get admin financier settlement by ID
	 *     tags: [AdminFinancierSettlement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema: { type: string, pattern: "^[0-9a-fA-F]{24}$" }
	 *     responses:
	 *       200:
	 *         description: Settlement retrieved
	 *       404:
	 *         description: Settlement not found
	 */
	routes.get("/:id", controller.getById);

	/**
	 * @openapi
	 * /api/admin-financier-settlement:
	 *   post:
	 *     summary: Create admin financier settlement (remittance)
	 *     description: Creates a remittance record. Optional multipart field "receipt" (image/PDF) uploads to Cloudinary and sets receiptAttachmentUrl. Body may include receiptType, receiptNumber.
	 *     tags: [AdminFinancierSettlement]
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema: { type: object, required: [financierDisbursementId, financierConfigId, amount] }
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               financierDisbursementId: { type: string }
	 *               financierConfigId: { type: string }
	 *               amount: { type: number }
	 *               receipt: { type: string, format: binary }
	 *               receiptType: { type: string, enum: [OR, BANK_RECEIPT] }
	 *               receiptNumber: { type: string }
	 *     responses:
	 *       201: { description: Settlement created (and receipt URL set if file uploaded to Cloudinary) }
	 *       400: { description: Validation error }
	 *       404: { description: Financier disbursement not found }
	 */
	routes.post("/", uploadDisbursementReceipt, controller.create);

	/**
	 * @openapi
	 * /api/admin-financier-settlement/{id}:
	 *   patch:
	 *     summary: Update admin financier settlement
	 *     description: |
	 *       Partial update. Accepts application/json or multipart/form-data.
	 *       With multipart, optional file field "receipt" (image/PDF) uploads to Cloudinary and sets receiptAttachmentUrl.
	 *       Form fields receiptType (OR|BANK_RECEIPT), receiptNumber merged when receipt file is sent.
	 *     tags: [AdminFinancierSettlement]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema: { type: string, pattern: "^[0-9a-fA-F]{24}$" }
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema: { type: object, description: Any updatable fields (amount, receiptType, receiptNumber, receiptAttachmentUrl, referenceNo, notes, etc.) }
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               receipt: { type: string, format: binary }
	 *               receiptType: { type: string, enum: [OR, BANK_RECEIPT] }
	 *               receiptNumber: { type: string }
	 *               amount: { type: number }
	 *               referenceNo: { type: string }
	 *               notes: { type: string }
	 *     responses:
	 *       200: { description: Settlement updated }
	 *       400: { description: Validation error }
	 *       404: { description: Settlement not found }
	 */
	routes.patch("/:id", uploadDisbursementReceipt, controller.update);
	routes.delete("/:id", controller.remove);

	route.use(path, routes);
	return route;
};
