import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import { Request, Response } from "express";

// Centralized rate limiting configuration
const RATE_LIMIT_CONFIG = {
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 300, // 300 requests per 15 minutes
	delayAfter: 150, // Start slowing down after 150 requests
	delayMs: 100, // Add 100ms delay per request after limit
	maxDelayMs: 5000, // Maximum delay of 5 seconds
};

// Create centralized rate limiter
export const rateLimiter = rateLimit({
	windowMs: RATE_LIMIT_CONFIG.windowMs,
	max: RATE_LIMIT_CONFIG.max,
	message: {
		error: "Too many requests",
		message: "Rate limit exceeded. Please try again later.",
		retryAfter: Math.ceil(RATE_LIMIT_CONFIG.windowMs / 1000),
	},
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req: Request) => req.ip || "unknown",
	handler: (req: Request, res: Response) => {
		res.status(429).json({
			error: "Too many requests",
			message: "Rate limit exceeded. Please try again later.",
			retryAfter: Math.ceil(RATE_LIMIT_CONFIG.windowMs / 1000),
			timestamp: new Date().toISOString(),
		});
	},
});

// Create centralized slow down middleware
export const slowDownMiddleware = slowDown({
	windowMs: RATE_LIMIT_CONFIG.windowMs,
	delayAfter: RATE_LIMIT_CONFIG.delayAfter,
	delayMs: () => RATE_LIMIT_CONFIG.delayMs,
	maxDelayMs: RATE_LIMIT_CONFIG.maxDelayMs,
	validate: { delayMs: false },
});

// Export the centralized configuration
export const rateLimitConfig = RATE_LIMIT_CONFIG;

// Default export with the main rate limiter
export default rateLimiter;
