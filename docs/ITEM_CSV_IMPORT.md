# Item CSV Import Guide

## Endpoint

**POST** `/api/items/import`

## Overview

The CSV import endpoint allows you to bulk import items from a CSV file. This is useful for:

- Initial data migration
- Bulk product updates
- Importing items from external systems

## CSV Format

### Required Columns

| Column         | Description                            | Example              |
| -------------- | -------------------------------------- | -------------------- |
| `sku`          | Stock Keeping Unit (unique identifier) | `ITEM-001`           |
| `name`         | Item name                              | `Sample Product`     |
| `category`     | Category slug (must exist in database) | `electronics`        |
| `vendor`       | Vendor code (must exist in database)   | `VENDOR-001`         |
| `retailPrice`  | Retail price                           | `100.00` or `22,995` |
| `sellingPrice` | Selling price                          | `80.00` or `18,500`  |

### Optional Columns

| Column              | Description                    | Example                         | Default   |
| ------------------- | ------------------------------ | ------------------------------- | --------- |
| `itemType`          | Item type: `PRODUCT` or `LOAN` | `PRODUCT`                       | `PRODUCT` |
| `description`       | Item description               | `This is a sample product`      | `null`    |
| `costPrice`         | Cost price                     | `50.00`                         | `null`    |
| `stockQuantity`     | Stock quantity                 | `100`                           | `0`       |
| `lowStockThreshold` | Low stock threshold            | `10`                            | `10`      |
| `imageUrl`          | Main image URL                 | `https://example.com/image.jpg` | `null`    |
| `images`            | Comma-separated image URLs     | `url1,url2,url3`                | `null`    |
| `isActive`          | Active status                  | `true` or `TRUE` or `1`         | `true`    |
| `isFeatured`        | Featured status                | `true` or `TRUE` or `1`         | `false`   |
| `isAvailable`       | Available status               | `true` or `TRUE` or `1`         | `true`    |
| `details`           | Comma-separated details array  | `detail1,detail2,detail3`       | `null`    |
| `metadata`          | JSON metadata object           | `{"key":"value"}`               | `null`    |
| `specifications`    | JSON specifications object     | `{"color":"blue"}`              | `null`    |

### Notes

- **Price fields** can include comma separators (e.g., `22,995` will be parsed as `22995`)
- **Boolean fields** accept: `true`, `TRUE`, `1`, or `false`, `FALSE`, `0`
- **itemType** accepts: `PRODUCT` or `LOAN` (case-insensitive, defaults to `PRODUCT`)
- **Category** must match an existing category slug in the database
- **Vendor** must match an existing vendor code in the database
- **Duplicate SKUs** will be automatically renamed with a suffix (e.g., `ITEM-001` → `ITEM-001-1`)

## Example CSV

```csv
sku,name,category,vendor,retailPrice,sellingPrice,costPrice,stockQuantity,itemType,description,isActive
ITEM-001,Sample Product,electronics,VENDOR-001,100.00,80.00,50.00,100,PRODUCT,This is a sample product,true
ITEM-002,Another Product,electronics,VENDOR-001,200.00,150.00,100.00,50,PRODUCT,Another product description,true
ITEM-003,Loan Item,loans,VENDOR-002,5000.00,4500.00,4000.00,10,LOAN,This is a loan item,true
```

## Request Format

**Content-Type:** `multipart/form-data`

**Body:**

- `file`: CSV file (required)

## Example Request (cURL)

```bash
curl -X POST "http://localhost:3000/api/items/import" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@items.csv"
```

## Example Request (JavaScript/Fetch)

```javascript
const formData = new FormData();
formData.append("file", csvFile);

const response = await fetch("http://localhost:3000/api/items/import", {
	method: "POST",
	headers: {
		Authorization: "Bearer YOUR_TOKEN",
	},
	body: formData,
});

const result = await response.json();
console.log(result);
```

## Response Format

### Success Response (201)

```json
{
	"success": true,
	"message": "Items imported successfully: 100 created, 5 failed",
	"data": {
		"summary": {
			"totalRows": 105,
			"processed": 105,
			"successful": 100,
			"failed": 5
		},
		"errors": [
			{
				"row": 3,
				"sku": "ITEM-003",
				"error": "Category not found with slug: invalid-category"
			},
			{
				"row": 7,
				"sku": "ITEM-007",
				"error": "Vendor not found with code: INVALID-VENDOR"
			}
		],
		"skuChanges": [
			{
				"original": "ITEM-001",
				"new": "ITEM-001-1",
				"row": 2
			}
		]
	},
	"code": 201,
	"timestamp": "2024-01-22T10:00:00.000Z"
}
```

### Error Response (400/500)

```json
{
	"success": false,
	"error": {
		"message": "CSV import failed",
		"code": 500,
		"details": [
			{
				"field": "file",
				"message": "Failed to parse CSV file"
			}
		]
	},
	"code": 500,
	"timestamp": "2024-01-22T10:00:00.000Z"
}
```

## Features

### 1. Duplicate SKU Handling

If a SKU already exists in the database or appears multiple times in the CSV, the system will automatically generate a unique SKU by appending a suffix:

- `ITEM-001` (exists) → `ITEM-001-1`
- `ITEM-001-1` (exists) → `ITEM-001-2`
- etc.

### 2. Image Handling

You can provide images in two ways:

**Single image:**

```csv
imageUrl,...
https://example.com/image.jpg,...
```

**Multiple images (comma-separated):**

```csv
images,...
https://example.com/img1.jpg,https://example.com/img2.jpg,...
```

### 3. Specifications

You can provide specifications in multiple formats:

**Details array (comma-separated):**

```csv
details,...
detail1,detail2,detail3,...
```

**Metadata (JSON):**

```csv
metadata,...
{"key1":"value1","key2":"value2"},...
```

**Specifications (JSON):**

```csv
specifications,...
{"color":"blue","size":"large"},...
```

All will be merged into the `specifications` field.

### 4. Price Parsing

Prices can include comma separators for readability:

- `22,995` → `22995`
- `1,000.50` → `1000.50`
- `100` → `100`

## Validation

The import process validates each row using the `CreateItemSchema`:

- **Required fields** must be present and valid
- **ObjectIds** must be valid MongoDB ObjectId format
- **Numbers** must be valid numeric values
- **Enums** (itemType) must be valid enum values
- **URLs** (imageUrl) must be valid URL format

Rows that fail validation will be skipped and reported in the `errors` array.

## Best Practices

1. **Test with a small file first** - Import a few rows to verify the format
2. **Check category and vendor codes** - Ensure they exist in the database before importing
3. **Use dry-run if available** - Some systems support preview mode
4. **Backup your data** - Always backup before bulk imports
5. **Monitor the response** - Check the `errors` array for any issues
6. **Handle duplicates** - Review the `skuChanges` array to see which SKUs were renamed

## Troubleshooting

### Error: "Category not found with slug: X"

**Solution:** Ensure the category exists in the database with the exact slug specified in the CSV.

### Error: "Vendor not found with code: X"

**Solution:** Ensure the vendor exists in the database with the exact code specified in the CSV.

### Error: "Validation failed"

**Solution:** Check the error details in the response. Common issues:

- Missing required fields
- Invalid number formats
- Invalid ObjectId formats
- Invalid enum values

### Error: "Duplicate SKU"

**Solution:** The system will automatically handle duplicates by renaming them. Check the `skuChanges` array in the response.

## Related Endpoints

- **GET** `/api/items` - List all items
- **POST** `/api/items` - Create a single item
- **GET** `/api/items/:id` - Get item by ID
- **PATCH** `/api/items/:id` - Update item
- **DELETE** `/api/items/:id` - Delete item

## Related Documentation

- [Item API Usage Guide](./ITEM_API_USAGE.md)
- [Item Model Schema](../prisma/schema/items.prisma)
