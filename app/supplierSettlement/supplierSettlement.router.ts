import { Router, Request, Response, NextFunction } from "express";
import { uploadDisbursementReceipt } from "../../middleware/upload";

interface IController {
	getAdminToSupplierSoa(req: Request, res: Response, next: NextFunction): Promise<void>;
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	createRemittance(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	reconcile(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (_route: Router, controller: IController): Router => {
	const route = _route;
	const routes = Router();
	const path = "/supplier-settlement";

	// Ledger: GET /api/supplier-settlement/ledger/supplier/:supplierId?view=admin|supplier
	routes.get("/ledger/supplier/:supplierId", controller.getAdminToSupplierSoa);
	routes.post("/", controller.create);
	routes.get("/", controller.getAll);
	routes.get("/:id", controller.getById);
	routes.post("/:id/remittance", uploadDisbursementReceipt, controller.createRemittance);
	routes.patch("/:id", uploadDisbursementReceipt, controller.update);
	routes.delete("/:id", controller.remove);
	routes.post("/:id/reconcile", controller.reconcile);

	// Top-level: GET /api/ledger/supplier/:supplierId?view=admin|supplier
	route.get("/ledger/supplier/:supplierId", controller.getAdminToSupplierSoa);

	route.use(path, routes);
	return route;
};
