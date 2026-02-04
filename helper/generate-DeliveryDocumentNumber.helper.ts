import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";

const logger = getLogger();
const docLogger = logger.child({ module: "generateDeliveryDocumentNumber" });

const PREFIX = "DO-V-"; // Supplier DO prefix (DO-V- kept for backward compatibility)

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
		const prefix = `${PREFIX}${dateStr}-`;

		const todayStart = new Date(today);
		todayStart.setHours(0, 0, 0, 0);
		const todayEnd = new Date(today);
		todayEnd.setHours(23, 59, 59, 999);

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
		return `${PREFIX}${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
	}
};
