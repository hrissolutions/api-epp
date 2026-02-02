import express, { Router } from "express";
import { controller } from "./deliveryDocument.controller";
import { router } from "./deliveryDocument.router";
import { PrismaClient } from "../../generated/prisma";

export const deliveryDocumentModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = deliveryDocumentModule;
