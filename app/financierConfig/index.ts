import express, { Router } from "express";
import { controller } from "./financierConfig.controller";
import { router } from "./financierConfig.router";
import { PrismaClient } from "../../generated/prisma";

export const financierConfigModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = financierConfigModule;
