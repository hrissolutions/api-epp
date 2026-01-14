import { DMMF } from "@prisma/client/runtime/library";
import { Prisma } from "../generated/prisma";

const dmmf: DMMF.Document = Prisma.dmmf as unknown as DMMF.Document;

export const buildFindManyQuery = <T extends any | undefined>(
	whereClause: T,
	skip: number,
	limit: number,
	order: "asc" | "desc",
	sort?: string | object,
	fields?: string,
): any => {
	const query: any = {
		where: whereClause,
		skip,
		take: limit,
		orderBy: sort
			? typeof sort === "string" && !sort.startsWith("{")
				? { [sort]: order }
				: JSON.parse(sort as string)
			: { id: order as Prisma.SortOrder },
	};

	query.select = getNestedFields(fields);

	return query;
};

export const getNestedFields = (fields?: string) => {
	if (fields) {
		const fieldSelections = fields.split(",").reduce(
			(acc, field) => {
				const parts = field.trim().split(".");
				if (parts.length > 1) {
					const [parent, ...children] = parts;
					acc[parent] = acc[parent] || { select: {} };
					let current = acc[parent].select;
					for (let i = 0; i < children.length - 1; i++) {
						current[children[i]] = current[children[i]] || { select: {} };
						current = current[children[i]].select;
					}
					current[children[children.length - 1]] = true;
				} else {
					acc[parts[0]] = true;
				}
				return acc;
			},
			{ id: true } as Record<string, any>,
		);

		return fieldSelections;
	}
};

/**
 * Look up field metadata in Prisma DMMF for a single field
 */
function getFieldMeta(modelName: string, field: string): DMMF.Field | undefined {
	const model = dmmf.datamodel.models.find((m) => m.name === modelName);
	if (model) {
		return model.fields.find((f) => f.name === field);
	}
	const type = dmmf.datamodel.types.find((t) => t.name === modelName);
	if (type) {
		return type.fields.find((f) => f.name === field);
	}
	return undefined;
}

/**
 * Parse value based on field type
 */
function parseValue(field: DMMF.Field, val: string): any {
	switch (field.type) {
		case "String":
			return val;
		case "Int":
		case "BigInt":
			return parseInt(val, 10);
		case "Float":
		case "Decimal":
			return parseFloat(val);
		case "Boolean":
			return val.toLowerCase() === "true" || val.toLowerCase() === "yes" || val === "1";
		case "DateTime":
			return new Date(val);
		case "Json":
			try {
				return JSON.parse(val);
			} catch {
				return val;
			}
		default:
			// Handle enums and other types as strings
			return val;
	}
}

/**
 * Recursively build Prisma filter condition
 */
function buildCondition(modelName: string, path: string[], value: string): any {
	if (path.length === 0) return {};

	// Get metadata for the current (first) field
	const fieldMeta = getFieldMeta(modelName, path[0]);
	if (!fieldMeta) return {};

	// Terminal field (scalar or enum)
	if (path.length === 1) {
		if (fieldMeta.kind === "scalar" || fieldMeta.kind === "enum") {
			const parsedValue = parseValue(fieldMeta, value);
			if (fieldMeta.isList) {
				return { [path[0]]: { has: parsedValue } };
			}
			return { [path[0]]: parsedValue };
		}
		return {}; // Non-scalar/enum terminal fields are not supported for filtering
	}

	// Non-terminal field: recurse
	const nextModelName = fieldMeta.kind === "object" ? fieldMeta.type : modelName;
	const nestedCondition = buildCondition(nextModelName, path.slice(1), value);

	if (Object.keys(nestedCondition).length === 0) return {};

	if (fieldMeta.kind === "object") {
		if (fieldMeta.isList) {
			// For to-many relations or list composites (e.g., contactInfo.phones)
			return {
				[path[0]]: {
					some: fieldMeta.relationName ? nestedCondition : { is: nestedCondition },
				},
			};
		}
		// For to-one relations or composites (e.g., contactInfo, contactInfo.address)
		return { [path[0]]: fieldMeta.relationName ? nestedCondition : { is: nestedCondition } };
	}

	return {};
}

/**
 * Parse ?filter=key:value,key:value into an array of Prisma conditions
 */
export function buildFilterConditions(modelName: string, filterParam?: string): any[] {
	if (!filterParam) return [];

	const items = filterParam.split(",");

	const groups = new Map<string, string[]>();

	for (const item of items) {
		const [rawKey, rawValue] = item.split(":");
		if (!groups.has(rawKey)) {
			groups.set(rawKey, []);
		}
		groups.get(rawKey)!.push(rawValue);
	}

	const conditions: any[] = [];

	for (const [rawKey, values] of groups) {
		const path = rawKey.split(".");
		if (values.length === 1) {
			const condition = buildCondition(modelName, path, values[0]);
			if (Object.keys(condition).length > 0) {
				conditions.push(condition);
			}
		} else {
			const orConditions = values
				.map((v) => buildCondition(modelName, path, v))
				.filter((c) => Object.keys(c).length > 0);
			if (orConditions.length > 0) {
				conditions.push({ OR: orConditions });
			}
		}
	}

	return conditions;
}

/**
 * Build Prisma search conditions for specified String scalar or enum fields (including nested) in a model
 * @throws Error if any provided field is invalid
 */
export function buildSearchConditions(
	modelName: string,
	searchTerm?: string,
	searchFields?: string[],
): any[] {
	if (!searchTerm || !searchFields || searchFields.length === 0) return [];

	const model = dmmf.datamodel.models.find((m) => m.name === modelName);
	if (!model) {
		throw new Error(`Model "${modelName}" not found in Prisma schema`);
	}

	const conditions: any[] = [];
	const invalidFields: string[] = [];

	for (const field of searchFields) {
		const path = field.split(".");
		const isValid = validateFieldPath(modelName, path);
		if (!isValid) {
			invalidFields.push(field);
		} else {
			const condition = buildConditionForSearch(modelName, path, searchTerm);
			if (Object.keys(condition).length > 0) {
				conditions.push(condition);
			}
		}
	}

	if (invalidFields.length > 0) {
		throw new Error(
			`Invalid fields found for model "${modelName}": ${invalidFields.join(", ")}. Fields must be scalar String or enum types.`,
		);
	}

	if (conditions.length === 0) {
		throw new Error(
			`No valid scalar String or enum fields found for model "${modelName}" among provided fields: ${searchFields.join(", ")}`,
		);
	}

	return conditions;
}

/**
 * Helper to validate a field path
 */
function validateFieldPath(modelName: string, path: string[]): boolean {
	if (path.length === 0) return false;

	const fieldMeta = getFieldMeta(modelName, path[0]);
	if (!fieldMeta) return false;

	if (path.length === 1) {
		return (
			(fieldMeta.kind === "scalar" && fieldMeta.type === "String" && !fieldMeta.isList) ||
			fieldMeta.kind === "enum"
		);
	}

	if (fieldMeta.kind === "object") {
		const nextModelName = fieldMeta.type;
		return validateFieldPath(nextModelName, path.slice(1));
	}

	return false;
}

/**
 * Helper to build search condition for a single field path
 */
function buildConditionForSearch(modelName: string, path: string[], searchTerm: string): any {
	if (path.length === 0) return {};

	// Get metadata for the current (first) field
	const fieldMeta = getFieldMeta(modelName, path[0]);
	if (!fieldMeta) return {};

	// Terminal field (scalar String or enum)
	if (path.length === 1) {
		if (
			(fieldMeta.kind === "scalar" && fieldMeta.type === "String" && !fieldMeta.isList) ||
			fieldMeta.kind === "enum"
		) {
			return { [path[0]]: { contains: searchTerm, mode: "insensitive" } };
		}
		return {}; // Non-scalar String or non-enum fields are not supported
	}

	// Non-terminal field: recurse
	const nextModelName = fieldMeta.kind === "object" ? fieldMeta.type : modelName;
	const nestedCondition = buildConditionForSearch(nextModelName, path.slice(1), searchTerm);

	if (Object.keys(nestedCondition).length === 0) return {};

	if (fieldMeta.kind === "object") {
		if (fieldMeta.isList) {
			// For to-many relations or list composites (e.g., contactInfo.phones)
			return {
				[path[0]]: {
					some: fieldMeta.relationName ? nestedCondition : { is: nestedCondition },
				},
			};
		}
		// For to-one relations or composites (e.g., contactInfo, contactInfo.address)
		return { [path[0]]: fieldMeta.relationName ? nestedCondition : { is: nestedCondition } };
	}

	return {};
}

// Helper function to safely access nested values for groupBy function
function getNestedValue(obj: any, path: string): any {
	return path.split(".").reduce((acc, key) => {
		if (acc && typeof acc === "object" && key in acc) {
			return acc[key];
		}
		return undefined;
	}, obj);
}

// Helper function to group data by specified (possibly nested) field
export const groupDataByField = (data: any[], groupBy: string) => {
	const grouped: { [key: string]: any[] } = {};

	data.forEach((item) => {
		const groupValue = getNestedValue(item, groupBy) ?? "unassigned";
		if (!grouped[groupValue]) {
			grouped[groupValue] = [];
		}
		grouped[groupValue].push(item);
	});

	return grouped;
};
