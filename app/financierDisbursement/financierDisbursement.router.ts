import { Router, Request, Response, NextFunction } from "express";

interface IController {
	getLedger(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAdminToFinancierSoa(req: Request, res: Response, next: NextFunction): Promise<void>;
	getFinancierSoa(req: Request, res: Response, next: NextFunction): Promise<void>;
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getRemittances(req: Request, res: Response, next: NextFunction): Promise<void>;
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
	const path = "/financier-disbursement";

	routes.get("/ledger/admin", controller.getAdminToFinancierSoa);
	routes.get("/ledger/:financierConfigId", controller.getLedger);
	routes.get("/ledger/admin/:financierConfigId", controller.getAdminToFinancierSoa);
	routes.get(
		"/ledger/admin-to-financier/:financierConfigId",
		controller.getAdminToFinancierSoa,
	);
	routes.get("/ledger/financier/:financierConfigId", controller.getFinancierSoa);
	// Backward-compatible SOA aliases.
	routes.get("/soa/admin-to-financier/:financierConfigId", controller.getAdminToFinancierSoa);
	routes.get("/soa/financier/:financierConfigId", controller.getFinancierSoa);
	routes.post("/", controller.create);
	routes.post("/:id/remittance", controller.createRemittance);
	routes.get("/:id/remittances", controller.getRemittances);
	routes.get("/", controller.getAll);
	routes.get("/:id", controller.getById);
	routes.patch("/:id", controller.update);
	routes.delete("/:id", controller.remove);
	routes.post("/:id/reconcile", controller.reconcile);

	// Top-level ledger aliases without /financier-disbursement prefix.
	route.get("/ledger/admin", controller.getAdminToFinancierSoa);
	route.get("/ledger/:financierConfigId", controller.getLedger);
	route.get("/ledger/admin/:financierConfigId", controller.getAdminToFinancierSoa);
	route.get("/ledger/financier/:financierConfigId", controller.getFinancierSoa);

	route.use(path, routes);
	return route;
};
