import { Response } from "express";

export interface ErrorDetail {
	field?: string;
	message: string;
}

export interface ErrorResponse {
	status: "error";
	message: string;
	code: number;
	errors?: ErrorDetail[];
	timestamp: string;
}

export function buildErrorResponse(
	message: string,
	code: number = 500,
	errors?: ErrorDetail[],
): ErrorResponse {
	return {
		status: "error",
		message,
		code,
		errors,
		timestamp: new Date().toISOString(),
	};
}

// Optional: Helper to convert Zod errors to ErrorDetail format
export interface ErrorDetail {
	field?: string;
	message: string;
}

export function formatZodErrors(zodError: any): ErrorDetail[] {
	if (!zodError) return [];

	const formattedErrors = zodError; // Expecting zodError to be the result of error.format()

	return Object.entries(formattedErrors)
		.filter(([field]) => field !== "_errors") // Exclude top-level _errors
		.map(([field, error]: [string, any]) => ({
			field,
			message: error._errors?.[0] || "Validation error",
		}))
		.filter((error) => error.message !== "Validation error"); // Filter out generic errors
}
