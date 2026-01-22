import express, { Router } from "express";
import { controller } from "./item.controller";
import { router } from "./item.router";
import { PrismaClient } from "../../generated/prisma";

export const itemsModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = itemsModule;
