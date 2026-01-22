# Products CSV Import Guide

This guide explains how to import products from a CSV file.

## CSV Format Requirements

### Required Fields
- `sku` - Unique product SKU (string)
- `name` - Product name (string)
- `category` - Category slug (string, e.g., "electronics", "home-appliances")
- `vendor` - Vendor code (string, e.g., "TECH-001", "VENDOR-ABC")
- `retailPrice` - Retail price (number)
- `sellingPrice` - Selling price (number)

### Optional Fields
- `description` - Product description/summary (string, optional)
- `details` - **Product features/bullet points** - Comma-separated list (becomes array in specifications.details)
- `metadata` - Product metadata in JSON format (brand, model, type, etc.)
- `costPrice` - Cost price (number)
- `stockQuantity` - Stock quantity (integer, default: 0)
- `lowStockThreshold` - Low stock threshold (integer, default: 10)
- `imageUrl` - Main product image URL (string)
- `images` - Comma-separated list of image URLs (will be saved as FEATURED type)
- `specifications` - Additional specifications in JSON format (object)
- `weight` - Product weight (number)
- `dimensions` - Product dimensions (string, e.g., "45x65x30cm")
- `isActive` - Is product active? (boolean: true/TRUE/false/FALSE/1/0, case-insensitive, default: false)
- `isFeatured` - Is product featured? (boolean: true/TRUE/false/FALSE/1/0, case-insensitive, default: false)
- `isAvailable` - Is product available? (boolean: true/TRUE/false/FALSE/1/0, case-insensitive, default: true)

## Special Field Formats

### Images Field
- Format: Comma-separated URLs
- Example: `https://example.com/img1.jpg,https://example.com/img2.jpg,https://example.com/img3.jpg`
- All images will be saved with type "FEATURED"
- Whitespace around URLs will be trimmed

### Details Field (Product Features)
- **Purpose**: Main product features/bullet points shown to customers
- Format: Comma-separated text values
- Example: `with FREE Kolin KCF. 07TMAGAC,Full DC Inverter for 60% Energy Savings,Multi-Stage Air Filtration`
- Will be saved as an array in `specifications.details`
- Whitespace will be trimmed
- **Use this for**: Features, benefits, included items, key highlights

### Metadata Field
- **Purpose**: Structured product information (brand, model, type, etc.)
- Format: JSON object (must be valid JSON)
- Example: `{"brand":"Kolin","model":"K4G-100WCINV","power":"1.0 HP","type":"Window Type"}`
- Will be saved in `specifications.metadata`
- If invalid JSON, the field will be skipped with a warning
- **Use this for**: Brand, model, power, type, color, size, etc.

### Specifications Field
- **Purpose**: Additional technical specifications
- Format: JSON object (must be valid JSON)
- Example: `{"warranty":"1 year","energyRating":"5 star","voltageRange":"220-240V"}`
- Will be merged with details and metadata in specifications object
- If invalid JSON, the field will be skipped with a warning
- **Use this for**: Warranty, ratings, technical specs, certifications

### Price Fields
The CSV supports three price fields:
1. `retailPrice` - Regular customer price (required)
2. `employeePrice` - Employee discount price (required)
3. `costPrice` - Your cost/wholesale price (optional)

## CSV Template

A sample CSV template is provided at: `docs/products_import_template.csv`

## API Endpoint

**POST** `/api/products/import`

### Request
- Content-Type: `multipart/form-data`
- Field name: `file`
- File type: CSV (`.csv`)
- Max file size: 50MB

### Example using cURL
```bash
curl -X POST http://localhost:3000/api/products/import \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@products.csv"
```

### Example using Postman
1. Set method to POST
2. URL: `http://localhost:3000/api/products/import`
3. Go to "Body" tab
4. Select "form-data"
5. Add key "file" with type "File"
6. Choose your CSV file

### Response Format

Success response (201):
```json
{
  "success": true,
  "message": "Products imported successfully: 10 created, 2 failed",
  "data": {
    "summary": {
      "totalRows": 12,
      "processed": 12,
      "successful": 10,
      "failed": 2
    },
    "errors": [
      {
        "row": 3,
        "sku": "INVALID-SKU",
        "errors": [
          {
            "field": "categoryId",
            "message": "Invalid categoryId ObjectId format"
          }
        ]
      }
    ]
  }
}
```

## Validation Rules

1. **SKU**: Must be unique across all products
2. **Category**: Must be a valid category slug that exists in your database
3. **Vendor**: Must be a valid vendor code that exists in your database
4. **Prices**: Must be valid numbers
5. **Stock Quantities**: Must be non-negative integers
6. **Image URLs**: Must be valid URLs (when provided)
7. **Boolean Fields**: Accepts "true", "TRUE", "false", "FALSE", "1", "0", true, false (case-insensitive)

## Tips

1. **Test with Small Batches**: Start with a few rows to ensure format is correct
2. **Check Categories & Vendors**: Make sure the category slug and vendor code exist in your database
3. **Unique SKUs**: Ensure all SKUs are unique, duplicates will fail
4. **URL Encoding**: If details/images contain special characters, ensure proper CSV escaping
5. **Error Handling**: The import will continue even if some rows fail - check the errors array in response

## How to Get Category Slugs and Vendor Codes

### Get Category Slugs
```bash
curl -X GET "http://localhost:3000/api/category?fields=slug,name"
```
Example categories:
- `electronics` - Electronics category
- `home-appliances` - Home Appliances category
- `furniture` - Furniture category

### Get Vendor Codes
```bash
curl -X GET "http://localhost:3000/api/vendor?fields=code,name"
```
Example vendors:
- `TECH-001` - Tech Solutions Inc.
- `VENDOR-ABC` - ABC Corporation
- `SUP-123` - Supplier 123

## Common Errors

### Category Not Found
- **Error**: "Category not found with slug: xyz"
- **Solution**: Ensure the category slug exists in your database. Check available categories using the API

### Vendor Not Found
- **Error**: "Vendor not found with code: ABC-123"
- **Solution**: Ensure the vendor code exists in your database. Check available vendors using the API

### Duplicate SKU
- **Error**: "Unique constraint failed on the fields: (`sku`)"
- **Solution**: Ensure all SKUs are unique

### Invalid Price
- **Error**: "Expected number, received nan"
- **Solution**: Ensure price fields contain valid numbers

### Missing Required Fields
- **Error**: "Product name is required" or "Category slug is required"
- **Solution**: Ensure all required fields are present in each row

## Example CSV Row

```csv
sku,name,description,category,vendor,retailPrice,sellingPrice,costPrice,stockQuantity,lowStockThreshold,imageUrl,images,details,metadata,specifications,weight,dimensions,isActive,isFeatured,isAvailable
ABC-123,Product Name,Optional short description,electronics,TECH-001,99.99,89.99,75.00,100,10,https://example.com/main.jpg,"https://example.com/img1.jpg,https://example.com/img2.jpg","Feature 1,Feature 2,Feature 3","{""brand"":""BrandName"",""model"":""ABC-123"",""color"":""Blue""}","{""warranty"":""2 years""}",2.5,10x20x5cm,true,false,true
```

## Field Structure in Database

When imported, the data is organized as:
```json
{
  "sku": "ABC-123",
  "name": "Product Name",
  "description": "Optional short description",
  "specifications": {
    "details": [
      "Feature 1",
      "Feature 2", 
      "Feature 3"
    ],
    "metadata": {
      "brand": "BrandName",
      "model": "ABC-123",
      "color": "Blue"
    },
    "warranty": "2 years"
  }
}
```
