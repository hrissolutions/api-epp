import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { PrismaClient } from "./generated/prisma";
import { config } from "./config/config";
import openApiSpecs from "./docs/openApiSpecs";
import verifyToken from "./middleware/verifyToken";
import { connectAllDatabases, disconnectAllDatabases } from "./config/database";
import { securityMiddleware, devSecurityMiddleware } from "./middleware/security";
import { authSecurityMiddleware } from "./middleware/security";

process.setMaxListeners(50);

const app = express();
const prisma = new PrismaClient();

const server = createServer(app);
const io = new Server(server, {
	cors: {
		origin: config.cors.origins,
		credentials: config.cors.credentials,
	},
});

app.use((req: Request, res: Response, next: NextFunction) => {
	(req as any).io = io;
	next();
});

// Apply security middleware based on environment
if (process.env.NODE_ENV === "production") {
	app.use(securityMiddleware);
	console.log("🔒 Production security middleware enabled");
} else {
	app.use(devSecurityMiddleware);
	console.log("⚠ Development security middleware enabled (relaxed mode)");
}

const template = require("./app/template")(prisma);
const products = require("./app/products")(prisma);
const purchase = require("./app/purchase")(prisma);
const category = require("./app/category")(prisma);
const wishlistitem = require("./app/wishlistitem")(prisma);
const cartitem = require("./app/cartitem")(prisma);
const order = require("./app/order")(prisma);
const orderitem = require("./app/orderitem")(prisma);
const vendor = require("./app/vendor")(prisma);
const installment = require("./app/installment")(prisma);
const transaction = require("./app/transaction")(prisma);
const orderApproval = require("./app/orderApproval")(prisma);
const approvalWorkflow = require("./app/approvalWorkflow")(prisma);
const approvalLevel = require("./app/approvalLevel")(prisma);
const docs = require("./app/docs/docs");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Configure CORS
app.use(
	cors({
		origin: config.cors.origins,
		credentials: config.cors.credentials,
	}),
);

// Health check endpoint
app.get("/", (req: Request, res: Response) => {
	res.status(200).json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
	});
});

// Enhanced health check with SLA status
app.get("/health", (req: Request, res: Response) => {
	// Import slaMonitor at the top level instead
	res.status(200).json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		message: "SLA monitoring is active",
	});
});

// Redis health check endpoint
app.get("/health/redis", async (req: Request, res: Response) => {
	try {
		const { redisClient } = await import("./config/redis");
		const start = Date.now();
		await redisClient.ping();
		const latency = Date.now() - start;

		const stats = await redisClient.getClient().info("memory");
		const memoryMatch = stats.match(/used_memory_human:(.+)/);
		const memoryUsage = memoryMatch ? memoryMatch[1].trim() : "Unknown";

		const dbsize = await redisClient.getClient().dbsize();

		res.status(200).json({
			status: "healthy",
			redis: {
				connected: redisClient.isClientConnected(),
				latency: `${latency}ms`,
				memoryUsage,
				totalKeys: dbsize,
			},
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		res.status(503).json({
			status: "unhealthy",
			redis: {
				connected: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			timestamp: new Date().toISOString(),
		});
	}
});

// Set up routes that don't need authentication
if (process.env.NODE_ENV !== "production") {
	app.use(`${config.baseApiPath}/swagger`, swaggerUi.serve, swaggerUi.setup(openApiSpecs()));
}

// Apply authentication-specific security middleware
app.use(`${config.baseApiPath}/auth`, authSecurityMiddleware);

// Apply middleware for protected routes, excluding /docs, /auth, /products, /purchase, /category, /wishlistItem, /wishlist, /cartItem, /cart, /order, /orderItem, /vendor, /installment, /transaction, /orderApproval, /approvalWorkflow, and /approvalLevel
app.use(config.baseApiPath, (req: Request, res: Response, next: NextFunction) => {
	if (req.path.startsWith("/docs") || req.path.startsWith("/auth") || req.path.startsWith("/products") || req.path.startsWith("/purchase") || req.path.startsWith("/category") || req.path.startsWith("/wishlistItem") || req.path.startsWith("/wishlist") || req.path.startsWith("/cartItem") || req.path.startsWith("/cart") || req.path.startsWith("/order") || req.path.startsWith("/orderItem") || req.path.startsWith("/vendor") || req.path.startsWith("/installment") || req.path.startsWith("/transaction") || req.path.startsWith("/orderApproval") || req.path.startsWith("/approvalWorkflow") || req.path.startsWith("/approvalLevel")) {
		// Skip middleware for the docs, auth, products, purchase, category, wishlistItem, wishlist, cartItem, cart, order, orderItem, vendor, installment, transaction, orderApproval, approvalWorkflow, and approvalLevel routes
		return next();
	}
	verifyToken(req, res, () => {
		next();
	});
});

app.use(config.baseApiPath, template);
app.use(config.baseApiPath, products);
app.use(config.baseApiPath, purchase);
app.use(config.baseApiPath, category);
app.use(config.baseApiPath, wishlistitem);
app.use(config.baseApiPath, cartitem);
app.use(config.baseApiPath, order);
app.use(config.baseApiPath, orderitem);
app.use(config.baseApiPath, vendor);
app.use(config.baseApiPath, installment);
app.use(config.baseApiPath, transaction);
app.use(config.baseApiPath, orderApproval);
app.use(config.baseApiPath, approvalWorkflow);
app.use(config.baseApiPath, approvalLevel);
app.use(config.baseApiPath, docs(prisma, app));

// Store app instance globally for docs generation after all routes are registered
(global as any).app = app;

server.listen(config.port, async () => {
	await connectAllDatabases();
	console.log(`Server is running on port ${config.port}`);
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
	try {
		await disconnectAllDatabases();
		console.log("✅ All database connections closed");
		process.exit(0);
	} catch (error) {
		console.error("❌ Error during shutdown:", error);
		process.exit(1);
	}
};

// Register shutdown handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
