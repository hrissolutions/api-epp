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
	const path = "/admin-supplier-settlement";

	routes.get("/", controller.getAll);
	routes.get("/:id", controller.getById);
	routes.post("/", uploadDisbursementReceipt, controller.create);
	routes.patch("/:id", uploadDisbursementReceipt, controller.update);
	routes.delete("/:id", controller.remove);

	route.use(path, routes);
	return route;
};
