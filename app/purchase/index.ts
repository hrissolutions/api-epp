import express, { Router } from "express";
import { controller } from "./purchase.controller";
import { router } from "./purchase.router";
import { PrismaClient } from "../../generated/prisma";

export const purchaseModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = purchaseModule;
