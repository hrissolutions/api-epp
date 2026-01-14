import express, { Router } from "express";
import { controller } from "./category.controller";
import { router } from "./category.router";
import { PrismaClient } from "../../generated/prisma";

export const categoryModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = categoryModule;
