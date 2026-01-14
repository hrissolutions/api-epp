import express, { Router } from "express";
import { controller } from "./transaction.controller";
import { router } from "./transaction.router";
import { PrismaClient } from "../../generated/prisma";

export const transactionModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = transactionModule;
