# Migrate Items: Add itemType

## Overview

This migration script updates all existing items in the database to have `itemType: "PRODUCT"`. This is necessary because:

1. The `Item` model was migrated from the `Product` model
2. All existing data in the database represents products (not loans)
3. The `itemType` field was added with a default value, but existing records may not have this field set

## Usage

### Basic Usage

```bash
npx ts-node scripts/migrate-items-add-itemtype.ts
```

### Dry Run (Preview Changes)

To see what would be updated without making changes:

```bash
npx ts-node scripts/migrate-items-add-itemtype.ts --dry-run
```

or

```bash
npx ts-node scripts/migrate-items-add-itemtype.ts -d
```

### Force Mode (Skip Confirmation)

To skip the 5-second confirmation prompt:

```bash
npx ts-node scripts/migrate-items-add-itemtype.ts --force
```

or

```bash
npx ts-node scripts/migrate-items-add-itemtype.ts -f
```

### Combined Options

```bash
# Dry run with force (no confirmation needed)
npx ts-node scripts/migrate-items-add-itemtype.ts --dry-run --force
```

## What It Does

1. **Fetches all items** from the database
2. **Identifies items** that don't have `itemType` set (null, undefined, or missing)
3. **Updates items** in batches of 100 to set `itemType: "PRODUCT"`
4. **Verifies** that all items now have `itemType` set
5. **Reports** a summary of the migration

## Example Output

```
============================================================
Item Type Migration Script
============================================================
This script will update all items to have itemType: 'PRODUCT'

[2024-01-22 10:00:00] Starting migration: Adding itemType to all items...
[2024-01-22 10:00:00] Mode: LIVE
[2024-01-22 10:00:00] Fetching all items from database...
[2024-01-22 10:00:01] Found 150 items in database
[2024-01-22 10:00:01] Items that need itemType update: 150
[2024-01-22 10:00:01] Items already with itemType: 0
[2024-01-22 10:00:01] Sample of items to be updated:
[2024-01-22 10:00:01]   - ITEM-001 (Sample Product): itemType = null → PRODUCT
[2024-01-22 10:00:01]   - ITEM-002 (Another Product): itemType = null → PRODUCT
...

⚠️  WARNING: This will update 150 items in the database.
Press Ctrl+C to cancel, or wait 5 seconds to continue...

[2024-01-22 10:00:06] Updating items in batches of 100...
[2024-01-22 10:00:06] Processing batch 1/2 (100 items)...
[2024-01-22 10:00:07] ✓ Batch 1 completed: 100 items updated
[2024-01-22 10:00:07] Processing batch 2/2 (50 items)...
[2024-01-22 10:00:08] ✓ Batch 2 completed: 50 items updated

============================================================
Migration Summary:
  Total items in database: 150
  Items updated: 150
  Items skipped (already had itemType): 0
============================================================

[2024-01-22 10:00:08] Verifying migration...
[2024-01-22 10:00:08] ✓ Verification passed: All items now have itemType set

✅ Migration script completed successfully
```

## Safety Features

1. **Dry Run Mode**: Preview changes before applying them
2. **Confirmation Prompt**: 5-second delay before making changes (unless `--force` is used)
3. **Batch Processing**: Updates items in batches to avoid overwhelming the database
4. **Error Handling**: Continues processing even if a batch fails
5. **Verification**: Checks that all items have `itemType` set after migration

## Manual MongoDB Alternative

If you prefer to run the migration directly in MongoDB:

```javascript
// Connect to your database
use your_database_name

// Update all items without itemType
db.items.updateMany(
  { itemType: { $exists: false } },
  { $set: { itemType: "PRODUCT" } }
)

// Or update items with null itemType
db.items.updateMany(
  { itemType: null },
  { $set: { itemType: "PRODUCT" } }
)

// Verify the update
db.items.find({ itemType: { $ne: "PRODUCT" } }).count()  // Should return 0
```

## Rollback

If you need to rollback (remove itemType from all items):

```javascript
// In MongoDB shell
db.items.updateMany({}, { $unset: { itemType: "" } });
```

**Note:** Rollback is not recommended as `itemType` is now a required field in the schema.

## Related Files

- `scripts/migrate-items-add-itemtype.ts` - Migration script
- `prisma/schema/items.prisma` - Item model schema
- `zod/items.zod.ts` - Item validation schema

## Troubleshooting

### Error: "Cannot connect to database"

Make sure your `.env` file has the correct `DATABASE_URL`:

```env
DATABASE_URL="mongodb://localhost:27017/your-database"
```

### Error: "Items still without itemType after migration"

This could happen if:

1. New items were created during migration
2. Some items have invalid data

Run the script again - it will only update items that need updating.

### Script hangs or times out

If you have a very large number of items, the script may take a while. You can:

1. Monitor the logs to see progress
2. Increase the batch size in the script (change `batchSize` variable)
3. Run the MongoDB command directly for faster execution
