/**
 * Migration script to rename employeePrice to sellingPrice in the products collection
 * 
 * This script:
 * 1. Finds all products with employeePrice field using raw MongoDB query
 * 2. Copies employeePrice value to sellingPrice
 * 3. Removes the old employeePrice field
 * 
 * Usage:
 *   npx ts-node scripts/migrate-employeePrice-to-sellingPrice.ts
 * 
 * Or compile and run:
 *   npx tsc scripts/migrate-employeePrice-to-sellingPrice.ts
 *   node scripts/migrate-employeePrice-to-sellingPrice.js
 * 
 * Note: Make sure to run this AFTER updating the Prisma schema to use sellingPrice
 * and regenerate the Prisma client.
 */

import { PrismaClient } from "../generated/prisma";
import * as dotenv from "dotenv";
import { ObjectId } from "mongodb";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function migrateEmployeePriceToSellingPrice() {
	try {
		console.log("🚀 Starting migration: employeePrice → sellingPrice\n");

		// Step 1: Find all products that have employeePrice field
		// Use raw MongoDB query to access the field
		console.log("🔍 Finding products with employeePrice field...\n");

		// Use aggregate to find products with employeePrice
		const products = await prisma.$runCommandRaw({
			aggregate: "products",
			pipeline: [
				{
					$match: {
						employeePrice: { $exists: true, $ne: null },
					},
				},
				{
					$project: {
						_id: 1,
						sku: 1,
						name: 1,
						employeePrice: 1,
						sellingPrice: 1,
					},
				},
			],
			cursor: {},
		}) as any;

		const productList = products.cursor?.firstBatch || [];

		if (productList.length === 0) {
			console.log("✅ No products with employeePrice field found. Migration may have already been completed.\n");
			return;
		}

		console.log(`📊 Found ${productList.length} product(s) with employeePrice field:\n`);

		// Step 2: Update each product
		console.log("🔧 Migrating employeePrice to sellingPrice...\n");

		let totalUpdated = 0;
		let totalSkipped = 0;
		const updates: Array<{ id: string; sku: string; name: string; oldValue: number; newValue: number }> = [];

		for (const product of productList) {
			const productId = product._id;
			const employeePrice = product.employeePrice;
			const existingSellingPrice = product.sellingPrice;

			// Skip if sellingPrice already exists and employeePrice is the same
			if (existingSellingPrice !== undefined && existingSellingPrice === employeePrice) {
				console.log(`   ⏭️  Skipped: ${product.name || 'Unknown'} (${product.sku || 'N/A'}) - sellingPrice already set\n`);
				totalSkipped++;
				continue;
			}

			// Skip if employeePrice is null or undefined
			if (employeePrice === null || employeePrice === undefined) {
				console.log(`   ⏭️  Skipped: ${product.name || 'Unknown'} (${product.sku || 'N/A'}) - employeePrice is null\n`);
				totalSkipped++;
				continue;
			}

			try {
				// Use updateMany with raw MongoDB query
				// Convert ObjectId to proper format
				const objectId = typeof productId === 'string' ? new ObjectId(productId) : productId;
				
				// Use updateOne command
				await prisma.$runCommandRaw({
					update: "products",
					updates: [
						{
							q: { _id: objectId },
							u: {
								$set: { sellingPrice: employeePrice },
								$unset: { employeePrice: "" },
							},
							upsert: false,
							multi: false,
						},
					],
				});

				updates.push({
					id: objectId.toString(),
					sku: product.sku || 'N/A',
					name: product.name || 'Unknown',
					oldValue: employeePrice,
					newValue: employeePrice,
				});

				totalUpdated++;
				console.log(`   ✅ Updated: ${product.name || 'Unknown'} (${product.sku || 'N/A'})`);
				console.log(`      employeePrice: ${employeePrice} → sellingPrice: ${employeePrice}\n`);
			} catch (error: any) {
				console.error(`   ❌ Failed to update product ${productId}: ${error.message}\n`);
			}
		}

		// Step 3: Verify migration
		console.log("\n🔍 Verifying migration...\n");

		const remaining = await prisma.$runCommandRaw({
			aggregate: "products",
			pipeline: [
				{
					$match: {
						employeePrice: { $exists: true },
					},
				},
				{
					$count: "count",
				},
			],
			cursor: {},
		}) as any;

		const remainingCount = remaining.cursor?.firstBatch?.[0]?.count || 0;

		// Step 4: Summary
		console.log("\n" + "=".repeat(60));
		console.log("📊 MIGRATION SUMMARY");
		console.log("=".repeat(60));
		console.log(`   Products found with employeePrice: ${productList.length}`);
		console.log(`   Products updated: ${totalUpdated}`);
		console.log(`   Products skipped: ${totalSkipped}`);
		console.log(`   Products still with employeePrice: ${remainingCount}`);

		if (updates.length > 0) {
			console.log("\n📝 Sample Updated Products (first 10):");
			for (const update of updates.slice(0, 10)) {
				console.log(`   - ${update.name} (${update.sku})`);
				console.log(`     ${update.oldValue} → ${update.newValue}`);
			}
			if (updates.length > 10) {
				console.log(`   ... and ${updates.length - 10} more`);
			}
		}

		if (remainingCount > 0) {
			console.log(`\n⚠️  Warning: ${remainingCount} product(s) still have employeePrice field.`);
			console.log("   You may need to run this script again or manually update these products.");
		} else {
			console.log("\n✅ Migration completed successfully!");
			console.log("   All products have been migrated from employeePrice to sellingPrice.\n");
		}
	} catch (error) {
		console.error("\n❌ Error during migration:", error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

// Run the migration
migrateEmployeePriceToSellingPrice().catch(console.error);
