import express, { Router } from "express";
import { controller } from "./orderApproval.controller";
import { router } from "./orderApproval.router";
import { PrismaClient } from "../../generated/prisma";

export const orderApprovalModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = orderApprovalModule;
