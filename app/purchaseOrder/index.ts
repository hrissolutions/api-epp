import express, { Router } from "express";
import { controller } from "./purchaseOrder.controller";
import { router } from "./purchaseOrder.router";
import { PrismaClient } from "../../generated/prisma";

export const purchaseOrderModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = purchaseOrderModule;
