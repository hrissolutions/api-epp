import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./adminSupplierSettlement.controller";
import { router } from "./adminSupplierSettlement.router";

export const adminSupplierSettlementModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = adminSupplierSettlementModule;
