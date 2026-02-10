import { Router, Request, Response, NextFunction } from "express";

interface IController {
	getLedger(req: Request, res: Response, next: NextFunction): Promise<void>;
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	reconcile(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (_route: Router, controller: IController): Router => {
	const route = _route;
	const routes = Router();
	const path = "/financier-disbursement";

	routes.get("/ledger/:financierConfigId", controller.getLedger);
	routes.post("/", controller.create);
	routes.get("/", controller.getAll);
	routes.get("/:id", controller.getById);
	routes.patch("/:id", controller.update);
	routes.delete("/:id", controller.remove);
	routes.post("/:id/reconcile", controller.reconcile);

	route.use(path, routes);
	return route;
};

