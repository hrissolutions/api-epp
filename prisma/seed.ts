import { PrismaClient } from "../generated/prisma";
import * as argon2 from "argon2";
import { seedTemplates } from "./seeds/templateSeeder";
const prisma = new PrismaClient();

async function main() {
	// Seed template data
	await seedTemplates();

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
