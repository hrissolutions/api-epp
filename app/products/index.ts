import express, { Router } from "express";
import { controller } from "./products.controller";
import { router } from "./products.router";
import { PrismaClient } from "../../generated/prisma";

export const productsModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = productsModule;
