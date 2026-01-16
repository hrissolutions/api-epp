import { PrismaClient } from "../generated/prisma";
import * as argon2 from "argon2";
import { seedTemplates } from "./seeds/templateSeeder";
import { seedEPP } from "./seeds/eppSeeder";
const prisma = new PrismaClient();

async function main() {
	// Seed template data
	// await seedTemplates();

	// Seed EPP data (vendor, categories, products)
	await seedEPP();

	console.log("Seeding completed successfully!");
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error("Error during seeding:", e);
		await prisma.$disconnect();
		process.exit(1);
	});
