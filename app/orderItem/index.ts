import express, { Router } from "express";
import { controller } from "./orderItem.controller";
import { router } from "./orderItem.router";
import { PrismaClient } from "../../generated/prisma";

export const orderItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = orderItemModule;
