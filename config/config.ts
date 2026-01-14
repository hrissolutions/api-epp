import dotenv from "dotenv";

dotenv.config();

export const config = {
	port: process.env.PORT || 3000,
	baseApiPath: "/api",
	betterStackSourceToken: process.env.BETTER_STACK_SOURCE_TOKEN || "",
	betterStackHost: process.env.BETTER_STACK_HOST || "",
	cors: {
		origins: process.env.CORS_ORIGINS
			? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
			: ["http://localhost:3000"],
		credentials: process.env.CORS_CREDENTIALS === "true",
	},
	redis: {
		url: process.env.REDIS_URL || "redis://localhost:6379",
		host: process.env.REDIS_HOST || "localhost",
		port: parseInt(process.env.REDIS_PORT || "6379"),
		password: process.env.REDIS_PASSWORD || undefined,
		db: parseInt(process.env.REDIS_DB || "0"),
		enabled: process.env.REDIS_ENABLED !== "false", // Default to enabled
	},
};
