import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./financierDisbursement.controller";
import { router } from "./financierDisbursement.router";

export const financierDisbursementModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = financierDisbursementModule;

