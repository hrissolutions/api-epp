import express, { Router } from "express";
import { controller } from "./workflowApprovalLevel.controller";
import { router } from "./workflowApprovalLevel.router";
import { PrismaClient } from "../../generated/prisma";

export const workflowApprovalLevelModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = workflowApprovalLevelModule;
