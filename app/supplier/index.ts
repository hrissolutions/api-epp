import express, { Router } from "express";
import { controller } from "./supplier.controller";
import { router } from "./supplier.router";
import { PrismaClient } from "../../generated/prisma";

export const supplierModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = supplierModule;
