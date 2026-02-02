import express, { Router } from "express";
import { controller } from "./financingAgreement.controller";
import { router } from "./financingAgreement.router";
import { PrismaClient } from "../../generated/prisma";

export const financingAgreementModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = financingAgreementModule;
