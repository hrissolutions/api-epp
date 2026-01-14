import express, { Router } from "express";
import { controller } from "./approvalWorkflow.controller";
import { router } from "./approvalWorkflow.router";
import { PrismaClient } from "../../generated/prisma";

export const approvalWorkflowModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = approvalWorkflowModule;
