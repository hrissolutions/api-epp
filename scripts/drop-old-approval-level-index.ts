/**
 * Script to drop old unique index from approvalLevels collection
 * This fixes the error: "Unique constraint failed on the constraint: approvalLevels_workflowId_level_key"
 * 
 * Usage:
 *   npx ts-node scripts/drop-old-approval-level-index.ts
 * 
 * Or compile and run:
 *   npx tsc scripts/drop-old-approval-level-index.ts
 *   node scripts/drop-old-approval-level-index.js
 */

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";
import { config } from "../config/config";

// Load environment variables
dotenv.config();

async function dropOldIndex() {
	const client = new MongoClient(config.database.url);
	
	try {
		await client.connect();
		console.log("\n🔍 Connected to MongoDB\n");
		
		const db = client.db();
		const collection = db.collection("approvalLevels");
		
		// List all current indexes
		console.log("📋 Current indexes on 'approvalLevels' collection:");
		const indexes = await collection.indexes();
		console.log(JSON.stringify(indexes, null, 2));
		
		// Try to drop the old unique index
		const indexNamesToDrop = [
			"workflowId_1_level_1",                    // Default MongoDB naming
			"approvalLevels_workflowId_level_key",      // Prisma naming
			"workflowId_level_unique",                  // Alternative naming
		];
		
		let dropped = false;
		
		for (const indexName of indexNamesToDrop) {
			try {
				await collection.dropIndex(indexName);
				console.log(`\n✅ Successfully dropped index: ${indexName}\n`);
				dropped = true;
				break;
			} catch (error: any) {
				// Index doesn't exist with this name, try next
				if (error.codeName === "IndexNotFound" || error.code === 27) {
					console.log(`ℹ️  Index '${indexName}' not found, trying next...`);
					continue;
				} else {
					console.log(`⚠️  Error checking index '${indexName}': ${error.message}`);
				}
			}
		}
		
		// If none of the named indexes exist, try to find and drop by key pattern
		if (!dropped) {
			console.log("\n🔍 Searching for index with workflowId and level fields...\n");
			
			for (const index of indexes) {
				const keys = index.key as any;
				// Check if index has both workflowId and level
				if (keys && keys.workflowId && keys.level) {
					const indexName = index.name as string;
					try {
						await collection.dropIndex(indexName);
						console.log(`✅ Successfully dropped index: ${indexName}`);
						console.log(`   Index keys: ${JSON.stringify(keys)}\n`);
						dropped = true;
						break;
					} catch (error: any) {
						console.log(`❌ Error dropping index '${indexName}': ${error.message}`);
					}
				}
			}
		}
		
		if (!dropped) {
			console.log("\n⚠️  No matching index found to drop.");
			console.log("   The index may have already been removed, or it doesn't exist.\n");
		} else {
			console.log("\n📋 Updated indexes on 'approvalLevels' collection:");
			const updatedIndexes = await collection.indexes();
			console.log(JSON.stringify(updatedIndexes, null, 2));
			console.log("\n✨ Done! You can now create ApprovalLevel records without the old constraint.\n");
		}
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	} finally {
		await client.close();
		console.log("🔌 Disconnected from MongoDB\n");
	}
}

// Run the script
dropOldIndex().catch(console.error);
