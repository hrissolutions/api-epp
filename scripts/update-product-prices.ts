/**
 * Script to update product prices with proper hierarchy:
 * - sellingPrice < costPrice < retailPrice
 * - Random differences of 1000-5000 between each level
 * 
 * This script:
 * 1. Finds all products with retailPrice
 * 2. Calculates costPrice = retailPrice - (random 1000-5000)
 * 3. Calculates sellingPrice = costPrice - (random 1000-5000)
 * 4. Updates products ensuring: sellingPrice < costPrice < retailPrice
 * 
 * Usage:
 *   npx ts-node scripts/update-product-prices.ts
 * 
 * Or compile and run:
 *   npx tsc scripts/update-product-prices.ts
 *   node scripts/update-product-prices.js
 */

import { PrismaClient } from "../generated/prisma";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

/**
 * Generate a random number between min and max (inclusive)
 */
function getRandomDifference(min: number = 1000, max: number = 5000): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Calculate prices with proper hierarchy:
 * - costPrice = retailPrice - random(1000-5000)
 * - sellingPrice = costPrice - random(1000-5000)
 * 
 * Ensures: sellingPrice < costPrice < retailPrice
 */
function calculatePrices(retailPrice: number): {
	costPrice: number;
	sellingPrice: number;
} {
	// Ensure retailPrice is valid
	if (!retailPrice || retailPrice <= 0) {
		throw new Error(`Invalid retailPrice: ${retailPrice}`);
	}

	// Calculate costPrice: retailPrice - random(1000-5000)
	// Ensure costPrice is at least 1000
	const costPriceDiff = getRandomDifference(1000, 5000);
	const costPrice = Math.max(1000, retailPrice - costPriceDiff);

	// Calculate sellingPrice: costPrice - random(1000-5000)
	// Ensure sellingPrice is at least 100
	const sellingPriceDiff = getRandomDifference(1000, 5000);
	const sellingPrice = Math.max(100, costPrice - sellingPriceDiff);

	// Final validation: ensure hierarchy is correct
	if (sellingPrice >= costPrice || costPrice >= retailPrice) {
		// If hierarchy is wrong, adjust sellingPrice to be lower
		const adjustedSellingPrice = Math.max(100, costPrice - 1000);
		return {
			costPrice,
			sellingPrice: adjustedSellingPrice,
		};
	}

	return {
		costPrice,
		sellingPrice,
	};
}

async function updateProductPrices() {
	try {
		console.log("🚀 Starting product price update...\n");
		console.log("📋 Price hierarchy: sellingPrice < costPrice < retailPrice\n");
		console.log("💰 Random differences: 1000-5000 between each level\n");

		// Step 1: Find all products with retailPrice
		console.log("🔍 Finding products with retailPrice...\n");

		const products = await prisma.product.findMany({
			where: {
				retailPrice: {
					gt: 0,
				},
			},
			select: {
				id: true,
				sku: true,
				name: true,
				retailPrice: true,
				costPrice: true,
				sellingPrice: true,
			},
			orderBy: {
				createdAt: "asc",
			},
		});

		if (products.length === 0) {
			console.log("✅ No products with retailPrice found.\n");
			return;
		}

		console.log(`📊 Found ${products.length} product(s) with retailPrice:\n`);

		// Step 2: Update each product
		console.log("🔧 Updating product prices...\n");

		let totalUpdated = 0;
		let totalSkipped = 0;
		let totalErrors = 0;
		const updates: Array<{
			id: string;
			sku: string;
			name: string;
			oldCostPrice: number | null;
			oldSellingPrice: number | null;
			newCostPrice: number;
			newSellingPrice: number;
			retailPrice: number;
		}> = [];

		for (const product of products) {
			try {
				const retailPrice = product.retailPrice;

				// Calculate new prices
				const { costPrice, sellingPrice } = calculatePrices(retailPrice);

				// Validate the hierarchy
				if (sellingPrice >= costPrice || costPrice >= retailPrice) {
					console.error(
						`   ❌ Invalid price hierarchy for ${product.name} (${product.sku}):`,
						`sellingPrice=${sellingPrice}, costPrice=${costPrice}, retailPrice=${retailPrice}\n`,
					);
					totalErrors++;
					continue;
				}

				// Update the product
				await prisma.product.update({
					where: { id: product.id },
					data: {
						costPrice: costPrice,
						sellingPrice: sellingPrice,
					},
				});

				updates.push({
					id: product.id,
					sku: product.sku,
					name: product.name,
					oldCostPrice: product.costPrice,
					oldSellingPrice: product.sellingPrice,
					newCostPrice: costPrice,
					newSellingPrice: sellingPrice,
					retailPrice: retailPrice,
				});

				totalUpdated++;
				console.log(`   ✅ Updated: ${product.name} (${product.sku})`);
				console.log(`      Retail Price: ${retailPrice.toFixed(2)}`);
				console.log(`      Cost Price: ${product.costPrice?.toFixed(2) || 'N/A'} → ${costPrice.toFixed(2)}`);
				console.log(`      Selling Price: ${product.sellingPrice?.toFixed(2) || 'N/A'} → ${sellingPrice.toFixed(2)}`);
				console.log(`      Difference (Retail-Cost): ${(retailPrice - costPrice).toFixed(2)}`);
				console.log(`      Difference (Cost-Selling): ${(costPrice - sellingPrice).toFixed(2)}\n`);
			} catch (error: any) {
				console.error(`   ❌ Failed to update product ${product.id} (${product.sku}): ${error.message}\n`);
				totalErrors++;
			}
		}

		// Step 3: Summary
		console.log("\n" + "=".repeat(70));
		console.log("📊 PRICE UPDATE SUMMARY");
		console.log("=".repeat(70));
		console.log(`   Total products found: ${products.length}`);
		console.log(`   Products updated: ${totalUpdated}`);
		console.log(`   Products skipped: ${totalSkipped}`);
		console.log(`   Errors: ${totalErrors}`);

		if (updates.length > 0) {
			console.log("\n📝 Sample Updated Products (first 10):");
			for (const update of updates.slice(0, 10)) {
				console.log(`\n   - ${update.name} (${update.sku})`);
				console.log(`     Retail Price: ${update.retailPrice.toFixed(2)}`);
				console.log(`     Cost Price: ${update.oldCostPrice?.toFixed(2) || 'N/A'} → ${update.newCostPrice.toFixed(2)}`);
				console.log(`     Selling Price: ${update.oldSellingPrice?.toFixed(2) || 'N/A'} → ${update.newSellingPrice.toFixed(2)}`);
				console.log(`     Hierarchy: ${update.newSellingPrice.toFixed(2)} < ${update.newCostPrice.toFixed(2)} < ${update.retailPrice.toFixed(2)} ✓`);
			}
			if (updates.length > 10) {
				console.log(`\n   ... and ${updates.length - 10} more products updated`);
			}

			// Calculate statistics
			const avgRetailCostDiff = updates.reduce((sum, u) => sum + (u.retailPrice - u.newCostPrice), 0) / updates.length;
			const avgCostSellingDiff = updates.reduce((sum, u) => sum + (u.newCostPrice - u.newSellingPrice), 0) / updates.length;

			console.log("\n📈 Price Statistics:");
			console.log(`   Average difference (Retail - Cost): ${avgRetailCostDiff.toFixed(2)}`);
			console.log(`   Average difference (Cost - Selling): ${avgCostSellingDiff.toFixed(2)}`);
		}

		if (totalErrors > 0) {
			console.log(`\n⚠️  Warning: ${totalErrors} product(s) failed to update.`);
		} else {
			console.log("\n✅ All product prices updated successfully!");
			console.log("   Price hierarchy maintained: sellingPrice < costPrice < retailPrice\n");
		}
	} catch (error) {
		console.error("\n❌ Error during price update:", error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

// Run the script
updateProductPrices().catch(console.error);
