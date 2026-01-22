# Item API Usage Guide

This guide explains how to use the Item API endpoints. The base path for all endpoints is `/api/items`.

## Base URL

All endpoints are prefixed with `/api/items`

---

## Endpoints Overview

### 1. **GET** `/api/items` - Get All Items

Retrieve a list of items with filtering, pagination, and sorting options.

### 2. **GET** `/api/items/:id` - Get Item by ID

Retrieve a specific item by its ID.

### 3. **POST** `/api/items` - Create New Item

Create a new item with optional image uploads.

### 4. **PATCH** `/api/items/:id` - Update Item

Update an existing item (partial update supported).

### 5. **DELETE** `/api/items/:id` - Delete Item

Permanently delete an item.

### 6. **POST** `/api/items/import` - Import Items from CSV

Bulk import items from a CSV file.

---

## Detailed Endpoint Documentation

### 1. Get All Items

**Endpoint:** `GET /api/items`

**Query Parameters:**

- `page` (optional, default: 1) - Page number for pagination
- `limit` (optional, default: 10, max: 100) - Number of items per page
- `sort` (optional) - Field to sort by (e.g., "createdAt", "name")
- `order` (optional, default: "desc") - Sort order: "asc" or "desc"
- `query` (optional) - Search query to filter by name or description
- `filter` (optional) - JSON array of filter objects for advanced filtering
    - Example: `[{"itemType":"PRODUCT"},{"status":"APPROVED"}]`
- `fields` (optional) - Comma-separated list of fields to include
    - Example: `"id,name,sku,retailPrice"`
- `groupBy` (optional) - Group results by a field name
- `document` (optional, value: "true") - Include items in response
- `pagination` (optional, value: "true") - Include pagination metadata
- `count` (optional, value: "true") - Include total count

**Example Requests:**

```bash
# Get all items (first page, 10 items)
GET /api/items

# Get items with pagination
GET /api/items?page=1&limit=20&pagination=true

# Search items by name/description
GET /api/items?query=laptop

# Filter by item type
GET /api/items?filter=[{"itemType":"PRODUCT"}]

# Sort by name ascending
GET /api/items?sort=name&order=asc

# Get specific fields only
GET /api/items?fields=id,name,sku,retailPrice,sellingPrice

# Get items grouped by category
GET /api/items?groupBy=categoryId&document=true
```

**Example Response:**

```json
{
	"success": true,
	"data": {
		"items": [
			{
				"id": "507f1f77bcf86cd799439011",
				"sku": "ITEM-001",
				"name": "Sample Item",
				"description": "Item description",
				"itemType": "PRODUCT",
				"retailPrice": 100.0,
				"sellingPrice": 80.0,
				"stockQuantity": 50,
				"status": "APPROVED",
				"isActive": true
			}
		],
		"pagination": {
			"page": 1,
			"limit": 10,
			"total": 100,
			"totalPages": 10
		},
		"count": 100
	}
}
```

---

### 2. Get Item by ID

**Endpoint:** `GET /api/items/:id`

**Path Parameters:**

- `id` (required) - Item ID (MongoDB ObjectId format)

**Query Parameters:**

- `fields` (optional) - Comma-separated list of fields to include

**Example Request:**

```bash
GET /api/items/507f1f77bcf86cd799439011

# Get specific fields only
GET /api/items/507f1f77bcf86cd799439011?fields=id,name,sku,price
```

**Example Response:**

```json
{
	"success": true,
	"data": {
		"item": {
			"id": "507f1f77bcf86cd799439011",
			"sku": "ITEM-001",
			"name": "Sample Item",
			"description": "Item description",
			"categoryId": "507f1f77bcf86cd799439012",
			"vendorId": "507f1f77bcf86cd799439013",
			"itemType": "PRODUCT",
			"retailPrice": 100.0,
			"sellingPrice": 80.0,
			"costPrice": 50.0,
			"stockQuantity": 50,
			"lowStockThreshold": 10,
			"imageUrl": "https://example.com/image.jpg",
			"images": [
				{
					"name": "cover-image",
					"url": "https://example.com/cover.jpg",
					"type": "COVER"
				}
			],
			"specifications": {
				"color": "Blue",
				"size": "Large"
			},
			"isActive": true,
			"isFeatured": false,
			"isAvailable": true,
			"status": "APPROVED",
			"createdAt": "2024-01-01T00:00:00.000Z",
			"updatedAt": "2024-01-01T00:00:00.000Z"
		}
	}
}
```

---

### 3. Create New Item

**Endpoint:** `POST /api/items`

**Content-Type:** `multipart/form-data` (for image uploads) or `application/json`

**Required Fields:**

- `sku` - Stock Keeping Unit (unique identifier)
- `name` - Item name
- `categoryId` - Category ID (MongoDB ObjectId)
- `vendorId` - Vendor ID (MongoDB ObjectId)
- `retailPrice` - Retail price (number)
- `sellingPrice` - Selling price (number)

**Optional Fields:**

- `description` - Item description
- `itemType` - "PRODUCT" or "LOAN" (default: "PRODUCT")
- `costPrice` - Cost price
- `stockQuantity` - Stock quantity (default: 0)
- `lowStockThreshold` - Low stock threshold (default: 10)
- `imageUrl` - Main image URL
- `images` - Array of image objects (JSON string)
- `specifications` - JSON object with specifications
- `isActive` - Active status (default: true)
- `isFeatured` - Featured status (default: false)
- `isAvailable` - Available status (default: true)
- `status` - "PENDING", "APPROVED", or "REJECTED" (default: "PENDING")

**Image Upload Fields (multipart/form-data):**

- `coverImages` - Cover images (max 5)
- `featuredImages` - Featured images (max 10)
- `galleryImages` - Gallery images (max 20)
- `thumbnailImages` - Thumbnail images (max 5)
- `packagingImages` - Packaging images (max 10)
- `detailImages` - Detail images (max 20)
- `lifestyleImages` - Lifestyle images (max 10)
- `sizeChartImages` - Size chart images (max 5)
- `instructionImages` - Instruction images (max 10)
- `images` - Generic images (max 20, fallback)

**Example Request (JSON):**

```bash
POST /api/items
Content-Type: application/json

{
  "sku": "ITEM-001",
  "name": "Sample Product",
  "description": "This is a sample product",
  "categoryId": "507f1f77bcf86cd799439012",
  "vendorId": "507f1f77bcf86cd799439013",
  "itemType": "PRODUCT",
  "retailPrice": 100.00,
  "sellingPrice": 80.00,
  "costPrice": 50.00,
  "stockQuantity": 50,
  "lowStockThreshold": 10,
  "isActive": true,
  "isFeatured": false,
  "isAvailable": true,
  "status": "PENDING",
  "specifications": {
    "color": "Blue",
    "size": "Large",
    "material": "Cotton"
  }
}
```

**Example Request (Form Data with Images):**

```bash
POST /api/items
Content-Type: multipart/form-data

sku=ITEM-001
name=Sample Product
description=This is a sample product
categoryId=507f1f77bcf86cd799439012
vendorId=507f1f77bcf86cd799439013
itemType=PRODUCT
retailPrice=100.00
sellingPrice=80.00
stockQuantity=50
coverImages=[file]
galleryImages=[file]
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "item": {
      "id": "507f1f77bcf86cd799439011",
      "sku": "ITEM-001",
      "name": "Sample Product",
      ...
    }
  }
}
```

---

### 4. Update Item

**Endpoint:** `PATCH /api/items/:id`

**Path Parameters:**

- `id` (required) - Item ID (MongoDB ObjectId format)

**Content-Type:** `multipart/form-data` (for image uploads) or `application/json`

**Request Body:** Partial update - only include fields you want to update

**Example Request:**

```bash
PATCH /api/items/507f1f77bcf86cd799439011
Content-Type: application/json

{
  "name": "Updated Item Name",
  "sellingPrice": 75.00,
  "stockQuantity": 45,
  "status": "APPROVED"
}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "item": {
      "id": "507f1f77bcf86cd799439011",
      "name": "Updated Item Name",
      ...
    }
  }
}
```

---

### 5. Delete Item

**Endpoint:** `DELETE /api/items/:id`

**Path Parameters:**

- `id` (required) - Item ID (MongoDB ObjectId format)

**Example Request:**

```bash
DELETE /api/items/507f1f77bcf86cd799439011
```

**Example Response:**

```json
{
	"success": true,
	"data": {}
}
```

---

### 6. Import Items from CSV

**Endpoint:** `POST /api/items/import`

**Content-Type:** `multipart/form-data`

**Request Body:**

- `file` (required) - CSV file containing item data

**CSV Format:**
The CSV file should contain columns matching the item schema fields:

- `sku` (required)
- `name` (required)
- `description`
- `categoryId` (required)
- `vendorId` (required)
- `itemType` (PRODUCT or LOAN)
- `retailPrice` (required)
- `sellingPrice` (required)
- `costPrice`
- `stockQuantity`
- `lowStockThreshold`
- `imageUrl`
- `isActive`
- `isFeatured`
- `isAvailable`
- `status`

**Example Request:**

```bash
POST /api/items/import
Content-Type: multipart/form-data

file=[CSV file]
```

**Example Response:**

```json
{
	"success": true,
	"data": {
		"summary": {
			"totalRows": 100,
			"processed": 95,
			"successful": 90,
			"failed": 5
		},
		"errors": [
			{
				"row": 3,
				"sku": "ITEM-003",
				"error": "Validation failed: SKU already exists"
			}
		]
	}
}
```

---

## Item Type Enum

Items can have one of two types:

- `PRODUCT` - Regular product item (default)
- `LOAN` - Loan item

## Item Status Enum

Items can have one of three statuses:

- `PENDING` - Created by vendor, awaiting approval (default)
- `APPROVED` - Approved and visible in item listings
- `REJECTED` - Rejected and not visible to normal users

## Item Image Types

When uploading images, you can specify different image types:

- `COVER` - Main cover/hero image
- `FEATURED` - Featured images
- `GALLERY` - Gallery images
- `THUMBNAIL` - Thumbnail/preview image
- `PACKAGING` - Item packaging image
- `DETAIL` - Detail/close-up images
- `LIFESTYLE` - Lifestyle/usage images
- `SIZE_CHART` - Size chart image
- `INSTRUCTION` - Instruction manual images
- `OTHER` - Other images

---

## Error Responses

All endpoints return errors in the following format:

```json
{
	"success": false,
	"error": {
		"message": "Error message",
		"code": 400,
		"details": [
			{
				"field": "sku",
				"message": "SKU is required"
			}
		]
	}
}
```

**Common HTTP Status Codes:**

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `404` - Not Found
- `500` - Internal Server Error

---

## Authentication

Most endpoints require authentication. Include your authentication token in the request headers:

```
Authorization: Bearer <your-token>
```

---

## Caching

The API uses Redis caching for improved performance:

- Item lists are cached for 60 seconds
- Individual items are cached for 90 seconds
- Cache is automatically invalidated when items are created, updated, or deleted

---

## Example cURL Commands

### Get all items

```bash
curl -X GET "http://localhost:3000/api/items?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get item by ID

```bash
curl -X GET "http://localhost:3000/api/items/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create item

```bash
curl -X POST "http://localhost:3000/api/items" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "ITEM-001",
    "name": "Sample Product",
    "categoryId": "507f1f77bcf86cd799439012",
    "vendorId": "507f1f77bcf86cd799439013",
    "retailPrice": 100.00,
    "sellingPrice": 80.00
  }'
```

### Update item

```bash
curl -X PATCH "http://localhost:3000/api/items/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "sellingPrice": 75.00
  }'
```

### Delete item

```bash
curl -X DELETE "http://localhost:3000/api/items/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Import from CSV

```bash
curl -X POST "http://localhost:3000/api/items/import" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@items.csv"
```

---

## Notes

1. All IDs must be valid MongoDB ObjectId format (24 character hex string)
2. Prices can be sent as numbers or strings (will be converted)
3. Image uploads are handled via Cloudinary
4. The API supports both JSON and form-data for create/update operations
5. Field selection (`fields` parameter) supports dot notation for nested fields
6. Filtering supports complex queries using JSON array format
