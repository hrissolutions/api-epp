# CSV Boolean Fields Fix

## Issue

Boolean fields (`isActive`, `isFeatured`, `isAvailable`) were being set to `false` even when CSV contained `TRUE`.

### Problem Example

**CSV Input:**

```csv
isActive,isFeatured,isAvailable
TRUE,TRUE,TRUE
```

**Database Result (Before Fix):**

```json
{
	"isActive": false,
	"isFeatured": false,
	"isAvailable": false
}
```

## Root Cause

The code was checking for lowercase `"true"` but CSV files from Excel/Google Sheets often export with uppercase `"TRUE"`.

**Previous Code:**

```typescript
isActive: row.isActive === "true" || row.isActive === "1" || row.isActive === true;
```

This would return `false` when `row.isActive === "TRUE"` (uppercase).

## Solution

Updated the code to handle both uppercase and lowercase values with case-insensitive comparison:

**Fixed Code:**

```typescript
isActive: row.isActive === "true" ||
	row.isActive === "TRUE" ||
	row.isActive === "1" ||
	row.isActive === true ||
	(typeof row.isActive === "string" && row.isActive.toLowerCase() === "true");
```

## Supported Boolean Values

The import now accepts **all** of these values (case-insensitive):

### True Values

- `true` (lowercase)
- `TRUE` (uppercase)
- `True` (mixed case)
- `1` (numeric)
- `true` (boolean)

### False Values

- `false` (lowercase)
- `FALSE` (uppercase)
- `False` (mixed case)
- `0` (numeric)
- `false` (boolean)
- Empty/undefined (only for `isAvailable`, defaults to `true`)

## Testing

### Test CSV

```csv
sku,name,category,vendor,retailPrice,sellingPrice,isActive,isFeatured,isAvailable
TEST-001,Test Product,electronics,TECH-001,100,90,TRUE,TRUE,TRUE
TEST-002,Test Product 2,electronics,TECH-001,100,90,true,true,true
TEST-003,Test Product 3,electronics,TECH-001,100,90,1,1,1
TEST-004,Test Product 4,electronics,TECH-001,100,90,False,FALSE,false
```

### Expected Results

```json
[
	{
		"sku": "TEST-001",
		"isActive": true,
		"isFeatured": true,
		"isAvailable": true
	},
	{
		"sku": "TEST-002",
		"isActive": true,
		"isFeatured": true,
		"isAvailable": true
	},
	{
		"sku": "TEST-003",
		"isActive": true,
		"isFeatured": true,
		"isAvailable": true
	},
	{
		"sku": "TEST-004",
		"isActive": false,
		"isFeatured": false,
		"isAvailable": false
	}
]
```

## Migration

If you previously imported products with `TRUE` values that were saved as `false`, you'll need to either:

### Option 1: Re-import

Delete the incorrect products and re-import with the fixed code.

### Option 2: Update via API

Update existing products using the PATCH endpoint:

```bash
curl -X PATCH http://localhost:3000/api/products/{id} \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": true,
    "isFeatured": true,
    "isAvailable": true
  }'
```

### Option 3: Bulk Update via Script

Create a script to update all products:

```javascript
const products = await prisma.product.findMany({
	where: {
		isActive: false,
		// Add more filters as needed
	},
});

for (const product of products) {
	await prisma.product.update({
		where: { id: product.id },
		data: {
			isActive: true,
			isFeatured: true,
			isAvailable: true,
		},
	});
}
```

## Files Modified

1. ✅ `app/products/products.controller.ts` - Updated boolean parsing logic
2. ✅ `docs/CSV_IMPORT_GUIDE.md` - Updated documentation

## Notes

- Excel and Google Sheets typically export boolean values as uppercase `TRUE`/`FALSE`
- The fix maintains backward compatibility with lowercase values
- Empty values for `isAvailable` still default to `true`
- The fix applies case-insensitive comparison for maximum compatibility
