import express, { Router } from "express";
import { controller } from "./approvalType.controller";
import { router } from "./approvalType.router";
import { PrismaClient } from "../../generated/prisma";

export const approvalTypeModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = approvalTypeModule;
