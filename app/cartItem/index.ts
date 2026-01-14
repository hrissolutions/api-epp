import express, { Router } from "express";
import { controller } from "./cartItem.controller";
import { router } from "./cartItem.router";
import { PrismaClient } from "../../generated/prisma";

export const cartItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = cartItemModule;
