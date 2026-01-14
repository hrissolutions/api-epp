import { PrismaClient } from "../generated/prisma";
import { getLogger } from "../helper/logger";
import { redisClient } from "./redis";

const prisma = new PrismaClient();
const logger = getLogger();

export async function connectDb() {
	try {
		await prisma.$connect();
		logger.info("Connected to the database successfully.");
	} catch (error) {
		logger.error("Error connecting to the database:", {
			error,
			stack: error instanceof Error ? error.stack : undefined,
		});
		process.exit(1);
	}
}

export async function connectRedis() {
	try {
		await redisClient.connect();
		logger.info("Connected to Redis successfully.");
	} catch (error) {
		logger.error("Error connecting to Redis:", {
			error,
			stack: error instanceof Error ? error.stack : undefined,
		});
		// Don't exit process for Redis connection failure - allow app to continue without caching
		logger.warn("Application will continue without Redis caching functionality.");
	}
}

export async function disconnectRedis() {
	try {
		await redisClient.disconnect();
		logger.info("Disconnected from Redis successfully.");
	} catch (error) {
		logger.error("Error disconnecting from Redis:", {
			error,
			stack: error instanceof Error ? error.stack : undefined,
		});
	}
}

export async function connectAllDatabases() {
	await connectDb();
	await connectRedis();
}

export async function disconnectAllDatabases() {
	try {
		await prisma.$disconnect();
		logger.info("Disconnected from the database successfully.");
	} catch (error) {
		logger.error("Error disconnecting from the database:", {
			error,
			stack: error instanceof Error ? error.stack : undefined,
		});
	}

	await disconnectRedis();
}
