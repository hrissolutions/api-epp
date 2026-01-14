import express, { Router } from "express";
import { controller } from "./order.controller";
import { router } from "./order.router";
import { PrismaClient } from "../../generated/prisma";

export const orderModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = orderModule;
