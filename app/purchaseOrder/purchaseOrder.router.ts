import { Router, Request, Response, NextFunction } from "express";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	approve(req: Request, res: Response, next: NextFunction): Promise<void>;
	confirm(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/purchaseOrder";

	routes.get("/", controller.getAll);
	routes.get("/:id", controller.getById);
	routes.post("/", controller.create);
	routes.post("/:id/approve", controller.approve);
	routes.post("/:id/confirm", controller.confirm);
	routes.patch("/:id", controller.update);
	routes.delete("/:id", controller.remove);

	route.use(path, routes);
	return route;
};
