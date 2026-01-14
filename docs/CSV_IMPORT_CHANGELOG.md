# CSV Import - Changelog

## Latest Update: User-Friendly Category & Vendor Fields

### What Changed

The CSV import now uses **human-readable identifiers** instead of MongoDB ObjectIds:

#### Before (Old)
```csv
sku,name,categoryId,vendorId,retailPrice
ABC-123,Product Name,507f1f77bcf86cd799439011,507f1f77bcf86cd799439012,99.99
```
❌ Required looking up 24-character MongoDB IDs

#### After (New)
```csv
sku,name,category,vendor,retailPrice
ABC-123,Product Name,electronics,TECH-001,99.99
```
✅ Uses simple, readable category slugs and vendor codes

### Benefits

1. **Easier to Use**: No need to copy complex MongoDB IDs
2. **More Readable**: CSV is human-readable and easier to maintain
3. **Less Error-Prone**: Slugs and codes are easier to type and verify
4. **Automatic Lookup**: System handles ID lookup behind the scenes

### How It Works

When you upload a CSV with:
```csv
category: electronics
vendor: TECH-001
```

The system automatically:
1. 🔍 Looks up category where `slug = "electronics"` → Gets `categoryId`
2. 🔍 Looks up vendor where `code = "TECH-001"` → Gets `vendorId`
3. ✅ Creates product with the actual database IDs

### Field Mapping

| CSV Column | Database Lookup | Database Field |
|------------|----------------|----------------|
| `category` | Find by `slug` | `categoryId` |
| `vendor` | Find by `code` | `vendorId` |

### Error Handling

If a category or vendor is not found:
- ❌ Row is skipped
- 📝 Error logged with details
- ⏭️ Import continues with next rows

Example error response:
```json
{
  "errors": [
    {
      "row": 3,
      "sku": "ABC-123",
      "error": "Category not found with slug: invalid-category"
    }
  ]
}
```

### Getting Available Values

#### Get Category Slugs
```bash
curl -X GET "http://localhost:3000/api/category?fields=slug,name&document=true"
```

Response:
```json
{
  "categorys": [
    {"slug": "electronics", "name": "Electronics"},
    {"slug": "home-appliances", "name": "Home Appliances"},
    {"slug": "furniture", "name": "Furniture"}
  ]
}
```

#### Get Vendor Codes
```bash
curl -X GET "http://localhost:3000/api/vendor?fields=code,name&document=true"
```

Response:
```json
{
  "vendors": [
    {"code": "TECH-001", "name": "Tech Solutions Inc."},
    {"code": "VENDOR-ABC", "name": "ABC Corporation"}
  ]
}
```

### Updated CSV Template

The template at `docs/products_import_template.csv` now uses:
- ✅ `category` (slug) - e.g., "electronics"
- ✅ `vendor` (code) - e.g., "TECH-001"

### Migration Guide

If you have existing CSVs with `categoryId` and `vendorId`:

1. **Option 1: Update Your CSV**
   - Get list of categories with slugs
   - Get list of vendors with codes
   - Replace IDs with slugs/codes

2. **Option 2: Query Mapping**
   ```bash
   # Get category ID → slug mapping
   curl "http://localhost:3000/api/category?fields=id,slug"
   
   # Get vendor ID → code mapping
   curl "http://localhost:3000/api/vendor?fields=id,code"
   ```

### Example Conversion

**Before:**
```csv
sku,categoryId,vendorId
ABC-123,6965b347a951da4abd50852a,6965e763e90c14d58d807bb3
```

**After:**
```csv
sku,category,vendor
ABC-123,electronics,TECH-001
```

### Files Modified

1. **`app/products/products.controller.ts`**
   - Added category lookup by slug
   - Added vendor lookup by code
   - Added validation for category/vendor not found

2. **`docs/products_import_template.csv`**
   - Changed `categoryId` → `category`
   - Changed `vendorId` → `vendor`
   - Updated example values

3. **`docs/CSV_IMPORT_GUIDE.md`**
   - Updated field descriptions
   - Added section on getting slugs/codes
   - Updated error handling documentation

4. **`docs/PRODUCTS_CSV_IMPORT.md`**
   - Updated examples
   - Added lookup explanation
   - Updated testing steps

### Validation

The import now validates:
1. ✅ Category slug exists in database
2. ✅ Vendor code exists in database
3. ✅ All other fields as before

### Backward Compatibility

⚠️ **Breaking Change**: The CSV format has changed
- Old CSVs with `categoryId` and `vendorId` will **not work**
- You must update CSVs to use `category` and `vendor`

### Support

For questions or issues:
- See `docs/CSV_IMPORT_GUIDE.md` for detailed usage
- See `docs/products_import_template.csv` for working template
- Controller code: `app/products/products.controller.ts`
