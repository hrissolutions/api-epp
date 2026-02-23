import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";

const logger = getLogger();
const docLogger = logger.child({ module: "generateDeliveryDocumentNumber" });

const PREFIX_DO = "DO-V-"; // Supplier DO prefix (DO-V- kept for backward compatibility)
const PREFIX_DR_V = "DR-V-"; // Admin DR prefix (VENDOR_TO_ADMIN receipt)

/**
 * Generates a unique Supplier DO number: DO-V-YYYYMMDD-A0001
 */
export const generateSupplierDONumber = async (
	prisma: PrismaClient,
	date?: Date,
): Promise<string> => {
	try {
		const today = date || new Date();
		const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
		const prefix = `${PREFIX_DO}${dateStr}-`;

		const todayDocs = await prisma.deliveryDocument.findMany({
			where: {
				documentNumber: { startsWith: prefix },
				documentType: "DELIVERY_ORDER",
				transferStage: "VENDOR_TO_ADMIN",
			},
			select: { documentNumber: true },
			orderBy: { createdAt: "desc" },
		});

		const sequences = todayDocs
			.map((d) => {
				const match = d.documentNumber.match(new RegExp(`^${prefix}([A-Z])(\\d{4})$`));
				if (match) return { letter: match[1], number: parseInt(match[2], 10) };
				return null;
			})
			.filter((s): s is { letter: string; number: number } => s !== null);

		if (sequences.length === 0) {
			const docNumber = `${prefix}A0001`;
			docLogger.info(`Generated Supplier DO number: ${docNumber}`);
			return docNumber;
		}

		const highest = sequences.reduce((max, s) => {
			const maxV = (max.letter.charCodeAt(0) - 65) * 10000 + max.number;
			const sV = (s.letter.charCodeAt(0) - 65) * 10000 + s.number;
			return sV > maxV ? s : max;
		}, sequences[0]);

		const nextNumber = highest.number >= 9999 ? 1 : highest.number + 1;
		const nextLetter =
			highest.number >= 9999
				? String.fromCharCode(highest.letter.charCodeAt(0) + 1)
				: highest.letter;
		const docNumber = `${prefix}${nextLetter}${String(nextNumber).padStart(4, "0")}`;
		docLogger.info(`Generated Supplier DO number: ${docNumber}`);
		return docNumber;
	} catch (error) {
		docLogger.error(`Error generating Supplier DO number: ${error}`);
		return `${PREFIX_DO}${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
	}
};

/**
 * Generates a unique Admin DR number (VENDOR_TO_ADMIN receipt): DR-V-YYYYMMDD-A0001
 */
export const generateAdminDRNumber = async (
	prisma: PrismaClient,
	date?: Date,
): Promise<string> => {
	try {
		const today = date || new Date();
		const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
		const prefix = `${PREFIX_DR_V}${dateStr}-`;

		const todayDocs = await prisma.deliveryDocument.findMany({
			where: {
				documentNumber: { startsWith: prefix },
				documentType: "DELIVERY_RECEIPT",
				transferStage: "VENDOR_TO_ADMIN",
			},
			select: { documentNumber: true },
			orderBy: { createdAt: "desc" },
		});

		const sequences = todayDocs
			.map((d) => {
				const match = d.documentNumber.match(new RegExp(`^${prefix}([A-Z])(\\d{4})$`));
				if (match) return { letter: match[1], number: parseInt(match[2], 10) };
				return null;
			})
			.filter((s): s is { letter: string; number: number } => s !== null);

		if (sequences.length === 0) {
			const docNumber = `${prefix}A0001`;
			docLogger.info(`Generated Admin DR number: ${docNumber}`);
			return docNumber;
		}

		const highest = sequences.reduce((max, s) => {
			const maxV = (max.letter.charCodeAt(0) - 65) * 10000 + max.number;
			const sV = (s.letter.charCodeAt(0) - 65) * 10000 + s.number;
			return sV > maxV ? s : max;
		}, sequences[0]);

		const nextNumber = highest.number >= 9999 ? 1 : highest.number + 1;
		const nextLetter =
			highest.number >= 9999
				? String.fromCharCode(highest.letter.charCodeAt(0) + 1)
				: highest.letter;
		const docNumber = `${prefix}${nextLetter}${String(nextNumber).padStart(4, "0")}`;
		docLogger.info(`Generated Admin DR number: ${docNumber}`);
		return docNumber;
	} catch (error) {
		docLogger.error(`Error generating Admin DR number: ${error}`);
		return `${PREFIX_DR_V}${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
	}
};
