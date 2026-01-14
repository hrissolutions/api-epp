import express, { Router } from "express";
import { controller } from "./wishlistItem.controller";
import { router } from "./wishlistItem.router";
import { PrismaClient } from "../../generated/prisma";

export const wishlistItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = wishlistItemModule;
