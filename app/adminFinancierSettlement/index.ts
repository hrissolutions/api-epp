import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./adminFinancierSettlement.controller";
import { router } from "./adminFinancierSettlement.router";

export const adminFinancierSettlementModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = adminFinancierSettlementModule;
