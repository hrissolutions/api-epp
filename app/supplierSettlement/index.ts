import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./supplierSettlement.controller";
import { router } from "./supplierSettlement.router";

export const supplierSettlementModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = supplierSettlementModule;

