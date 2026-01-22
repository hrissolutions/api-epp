# CSV Import Fields Update

## What Changed

Updated the CSV import to better organize product information with clearer separation between description, features, and metadata.

## Key Changes

### 1. **Description is Now Optional** ✅

- The `description` field is now truly optional
- Can be left empty if product features tell the whole story
- Use for general product summary when needed

### 2. **Details = Product Features** ✨

The `details` field is specifically for customer-facing product features (bullet points):

**Example:**

```csv
details: "with FREE Kolin KCF. 07TMAGAC,Full DC Inverter for 60% Energy Savings,Multi-Stage Air Filtration"
```

This matches what customers see in product listings:

- ✓ with FREE Kolin KCF. 07TMAGAC
- ✓ Full DC Inverter for 60% Energy Savings
- ✓ Multi-Stage Air Filtration

### 3. **New Metadata Field** 🆕

Added dedicated `metadata` field for structured product information:

**Example:**

```csv
metadata: "{""brand"":""Kolin"",""model"":""K4G-100WCINV"",""power"":""1.0 HP"",""type"":""Window Type""}"
```

Use for:

- Brand
- Model
- Product type
- Power/capacity
- Color
- Size
- Any structured attributes

### 4. **Specifications Field** 📋

Keep using `specifications` for additional technical specs:

**Example:**

```csv
specifications: "{""warranty"":""1 year"",""energyRating"":""5 star"",""voltageRange"":""220-240V""}"
```

## Updated CSV Structure

### CSV Format

```csv
sku,name,description,category,vendor,retailPrice,sellingPrice,costPrice,images,details,metadata,specifications
011700162641,Kolin K4G-100WCINV 1.0 HP,,electronics,TECH-001,25495,22995,20000,"url1.jpg,url2.jpg","Feature 1,Feature 2,Feature 3","{""brand"":""Kolin""}","{""warranty"":""1 year""}"
```

### Database Result

```json
{
	"sku": "011700162641",
	"name": "Kolin K4G-100WCINV 1.0 HP",
	"description": null,
	"specifications": {
		"details": ["Feature 1", "Feature 2", "Feature 3"],
		"metadata": {
			"brand": "Kolin"
		},
		"warranty": "1 year"
	}
}
```

## Field Usage Guide

| Field            | Purpose          | Format          | Required | Example                     |
| ---------------- | ---------------- | --------------- | -------- | --------------------------- |
| `sku`            | Product SKU      | String          | ✅ Yes   | `011700162641`              |
| `name`           | Product name     | String          | ✅ Yes   | `Kolin K4G-100WCINV 1.0 HP` |
| `description`    | General summary  | String          | ❌ No    | `Latest 2024 model`         |
| `category`       | Category slug    | String          | ✅ Yes   | `electronics`               |
| `vendor`         | Vendor code      | String          | ✅ Yes   | `TECH-001`                  |
| `details`        | Product features | Comma-separated | ❌ No    | `Feature 1,Feature 2`       |
| `metadata`       | Structured info  | JSON            | ❌ No    | `{"brand":"Kolin"}`         |
| `specifications` | Tech specs       | JSON            | ❌ No    | `{"warranty":"1 year"}`     |

## Real Example from Template

### Row 1: Kolin AC (No Description)

```csv
sku: 011700162641
name: Kolin K4G-100WCINV 1.0 HP Window Type Airconditioner
description: (empty - features speak for themselves)
details: "with FREE Kolin KCF. 07TMAGAC 7in Air Circulator,Full DC Inverter for 60% Energy Savings,Multi-Stage Air Filtration for Cleaner Air,Equipped with Smart Controller for Convenience"
metadata: {"brand":"Kolin","model":"K4G-100WCINV","power":"1.0 HP","type":"Window Type"}
specifications: {"warranty":"1 year","energyRating":"5 star"}
```

### Row 2: LG AC (With Description)

```csv
sku: 011700160582
name: 2024 Model - LG Dual Inverter Window Type Airconditioner 1.0 HP LA1006GC2
description: Latest 2024 model with advanced features
details: "Kilowatt Manager with ThinQ,AEC (Energy Control) Dual Inverter Compressor,10 Years Warranty on Compressor"
metadata: {"brand":"LG","model":"LA1006GC2","power":"1.0 HP","type":"Window Type"}
specifications: {"warranty":"10 years compressor"}
```

## Benefits

### For Users

- ✅ **Clearer structure** - Know exactly where to put each type of information
- ✅ **Optional description** - Don't need to duplicate features
- ✅ **Better organization** - Features, metadata, and specs are separated

### For Frontend

- ✅ **Easy to display** - Features are in an array, ready for bullet points
- ✅ **Easy to filter** - Metadata is structured for queries
- ✅ **Better UX** - Clear separation of information types

### For Database

- ✅ **Structured data** - Metadata is queryable
- ✅ **Consistent format** - All products follow same structure
- ✅ **Flexible** - Can add more fields without breaking structure

## Migration Notes

If you have existing CSVs, update them to use the new structure:

**Before:**

```csv
description: "with FREE Kolin KCF. 07TMAGAC 7in Air Circulator Full DC Inverter for 60% Energy Savings..."
details: "Detail 1,Detail 2"
specifications: {"brand":"Kolin","model":"K4G-100WCINV"}
```

**After:**

```csv
description: (leave empty or add short summary)
details: "with FREE Kolin KCF. 07TMAGAC,Full DC Inverter for 60% Energy Savings"
metadata: {"brand":"Kolin","model":"K4G-100WCINV"}
specifications: {"warranty":"1 year"}
```

## Files Updated

1. ✅ `app/products/products.controller.ts` - Updated field parsing logic
2. ✅ `docs/products_import_template.csv` - Updated with examples
3. ✅ `docs/CSV_IMPORT_GUIDE.md` - Updated documentation
4. ✅ `docs/PRODUCTS_CSV_IMPORT.md` - Updated field explanations

## Testing

Use the updated template to test:

```bash
curl -X POST http://localhost:3000/api/products/import \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@docs/products_import_template.csv"
```

The response will show:

- ✅ Details as array in `specifications.details`
- ✅ Metadata as object in `specifications.metadata`
- ✅ Additional specs merged in `specifications`
