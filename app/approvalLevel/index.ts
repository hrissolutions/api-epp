import express, { Router } from "express";
import { controller } from "./approvalLevel.controller";
import { router } from "./approvalLevel.router";
import { PrismaClient } from "../../generated/prisma";

export const approvalLevelModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = approvalLevelModule;
