import express, { Router } from "express";
import { controller } from "./installment.controller";
import { router } from "./installment.router";
import { PrismaClient } from "../../generated/prisma";

export const installmentModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = installmentModule;
