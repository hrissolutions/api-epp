import express, { Router } from "express";
import { controller } from "./vendor.controller";
import { router } from "./vendor.router";
import { PrismaClient } from "../../generated/prisma";

export const vendorModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = vendorModule;
