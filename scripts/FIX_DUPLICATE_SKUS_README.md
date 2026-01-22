# Fix Duplicate Product SKUs

This script finds and fixes duplicate SKUs in the products collection by making each SKU unique.

## Problem

When products have duplicate SKUs, it violates the unique constraint and can cause errors. This script:

1. Finds all products with duplicate SKUs
2. Keeps the oldest product (by `createdAt`) with the original SKU
3. Updates other duplicates by appending a suffix (`-1`, `-2`, etc.) to make them unique

## Usage

### Option 1: TypeScript Script (Recommended for Local Development)

```bash
npx ts-node scripts/fix-duplicate-product-skus.ts
```

**Requirements:**

- Node.js installed
- Prisma client generated
- Database connection configured in `.env`

### Option 2: MongoDB Web/Atlas Shell

1. Go to MongoDB Atlas dashboard
2. Click **"Database"** → **"Browse Collections"**
3. Click **"..."** → **"Open MongoDB Shell"**
4. Copy the entire contents of `scripts/fix-duplicate-product-skus-web.js`
5. Paste into the shell and press Enter

### Option 3: MongoDB Compass

1. Open MongoDB Compass
2. Connect to your database
3. Go to the **"products"** collection
4. Click on **"Aggregations"** tab
5. Use the aggregation pipeline to find duplicates, then manually update

## What the Script Does

### Step 1: Find Duplicates

- Scans all products
- Groups them by SKU
- Identifies SKUs that appear more than once

### Step 2: Fix Duplicates

- **Keeps the first product** (oldest by `createdAt`) with the original SKU
- **Updates other products** by appending a suffix:
    - First duplicate: `SKU-1`
    - Second duplicate: `SKU-2`
    - And so on...

### Step 3: Verify Uniqueness

- Checks that all SKUs are now unique
- Shows a summary of changes

## Example

**Before:**

```
Product A: SKU = "PROD-001"
Product B: SKU = "PROD-001"  ← Duplicate
Product C: SKU = "PROD-001"  ← Duplicate
```

**After:**

```
Product A: SKU = "PROD-001"  ← Kept original (oldest)
Product B: SKU = "PROD-001-1"  ← Updated
Product C: SKU = "PROD-001-2"  ← Updated
```

## Output Example

```
🚀 Starting duplicate SKU fix process...

🔍 Finding duplicate SKUs...

📊 Found 3 duplicate SKU group(s):

   SKU: "PROD-001" - 3 products
      - Product A (ID: 507f1f77bcf86cd799439011)
      - Product B (ID: 507f1f77bcf86cd799439012)
      - Product C (ID: 507f1f77bcf86cd799439013)

🔧 Fixing duplicate SKUs...

   ✅ Updated: Product B
      Old SKU: PROD-001
      New SKU: PROD-001-1

   ✅ Updated: Product C
      Old SKU: PROD-001
      New SKU: PROD-001-2

============================================================
📊 SUMMARY
============================================================
   Duplicate groups found: 3
   Products updated: 5
   Products kept with original SKU: 3

✅ All duplicate SKUs have been fixed!
```

## Safety Features

1. **Dry Run Option**: The script shows what will be changed before making updates
2. **Preserves Oldest**: Always keeps the oldest product with the original SKU
3. **Unique Generation**: Ensures new SKUs don't conflict with existing ones
4. **Error Handling**: Continues processing even if one update fails
5. **Verification**: Checks that all SKUs are unique after the fix

## Important Notes

⚠️ **Backup First**: Always backup your database before running this script

⚠️ **Test First**: Run on a test/staging database first if possible

⚠️ **SKU Format**: The script appends `-1`, `-2`, etc. If your SKUs already use this format, you may need to adjust the script

## Troubleshooting

### Error: "Cannot update product"

- Check database permissions
- Ensure the product ID exists
- Check for other constraints

### Still seeing duplicates after running

- Run the script again (it's safe to run multiple times)
- Check if new duplicates were created
- Verify the script completed successfully

### Script runs but no changes

- All SKUs may already be unique
- Check the output for confirmation

## Manual Fix (If Needed)

If you prefer to fix manually:

```javascript
// Find duplicates
db.products.aggregate([
	{
		$group: {
			_id: "$sku",
			count: { $sum: 1 },
			products: { $push: { id: "$_id", name: "$name" } },
		},
	},
	{
		$match: { count: { $gt: 1 } },
	},
]);

// Update a specific product
db.products.updateOne({ _id: ObjectId("product_id_here") }, { $set: { sku: "NEW-UNIQUE-SKU" } });
```
