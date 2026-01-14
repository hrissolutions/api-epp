import winston, { log } from "winston";
import { Logtail } from "@logtail/node";
import { LogtailTransport } from "@logtail/winston";
import { config } from "../config/config";

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

const consoleFormat = printf((info) => {
	const { level, message, error, module, timestamp, ...meta } = info;

	let errorInfo = "";
	let stackInfo = "";
	if (error) {
		if (error instanceof Error) {
			errorInfo = ` | Error: ${error.message}`;
			if (error.stack) {
				stackInfo = `\nStack: ${error.stack}`;
			}
		} else if (typeof error === "string") {
			errorInfo = ` | Error: ${error}`;
		} else if (typeof error === "object" && "message" in error) {
			errorInfo = ` | Error: ${(error as any).message}`;
			if ((error as any).stack) {
				stackInfo = `\nStack: ${(error as any).stack}`;
			}
		}
	}

	let validationInfo = "";
	if (meta.errors && Array.isArray(meta.errors)) {
		const errorFields = meta.errors
			.map((err: any) => `${err.field}: ${err.message}`)
			.join(", ");
		validationInfo = ` | Validation Errors: [${errorFields}]`;
	}

	const time = timestamp
		? new Date(timestamp as string).toLocaleTimeString()
		: new Date().toLocaleTimeString();

	const moduleInfo = module ? `[${module}]` : "";

	let mainMessage = message || "";
	if (typeof mainMessage === "string" && mainMessage.includes("request body:")) {
		mainMessage = mainMessage.replace(
			/request body:\s*\{[\s\S]*\}/,
			"request body: [FILTERED]",
		);
	}

	return `${time} ${level.toUpperCase()} ${moduleInfo} ${mainMessage}${errorInfo}${validationInfo}${stackInfo}`;
});

export const getLogger = () => {
	const logTransports: (winston.transport | LogtailTransport)[] = [
		new winston.transports.Console({
			format: combine(colorize(), timestamp(), consoleFormat),
		}),
		new winston.transports.File({
			filename: "logs/info.log",
			level: "info",
			format: combine(timestamp(), errors({ stack: true }), json()),
		}),
		new winston.transports.File({
			filename: "logs/error.log",
			level: "error",
			format: combine(timestamp(), errors({ stack: true }), json()),
		}),
	];

	if (config.betterStackSourceToken) {
		const logtail = new Logtail(config.betterStackSourceToken, {
			endpoint: config.betterStackHost,
		});
		logTransports.push(new LogtailTransport(logtail));
	}

	const logger = winston.createLogger({
		level: process.env.NODE_ENV === "production" ? "info" : "debug",
		format: combine(timestamp(), errors({ stack: true }), json()),
		transports: logTransports,
		exceptionHandlers: [
			new winston.transports.File({ filename: "logs/exception.log" }),
			new winston.transports.Console({
				format: combine(
					colorize(),
					timestamp(),
					printf((info) => {
						const { level, message, stack, timestamp } = info;
						const time = timestamp
							? new Date(timestamp as string).toLocaleTimeString()
							: new Date().toLocaleTimeString();
						return `${time} ${level.toUpperCase()} EXCEPTION: ${message}\n${stack || ""}`;
					}),
				),
			}),
		],
		rejectionHandlers: [
			new winston.transports.File({ filename: "logs/rejection.log" }),
			new winston.transports.Console({
				format: combine(
					colorize(),
					timestamp(),
					printf((info) => {
						const { level, message, stack, timestamp } = info;
						const time = timestamp
							? new Date(timestamp as string).toLocaleTimeString()
							: new Date().toLocaleTimeString();
						return `${time} ${level.toUpperCase()} REJECTION: ${message}\n${stack || ""}`;
					}),
				),
			}),
		],
	});

	return logger;
};
