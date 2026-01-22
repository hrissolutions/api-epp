# Products Service Documentation

## Overview

Complete products service with loan eligibility, multiple product types (Physical, Insurance, Service, Subscription, Voucher), and inventory management.

## Generated Files

### 1. Prisma Schema (`prisma/schema/products.prisma`)

```prisma
model Product {
  id              String        @id @default(auto()) @map("_id") @db.ObjectId
  name            String
  description     String
  category        String
  productType     ProductType

  // Pricing
  price           Float
  currency        String        @default("PHP")

  // Loan Configuration
  loanEligible    Boolean       @default(true)
  maxLoanTerm     Int?
  minDownPayment  Float?
  interestRate    Float?

  // Product Details
  brand           String?
  model           String?
  sku             String?       @unique
  imageUrls       String[]
  specifications  Json?

  // Inventory
  status          ProductStatus @default(ACTIVE)
  stockQuantity   Int?
  lowStockAlert   Int?

  // Insurance-specific fields
  insuranceDetails Json?

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([category])
  @@index([productType])
  @@index([status])
  @@index([loanEligible])
  @@map("products")
}

enum ProductType {
  PHYSICAL_PRODUCT
  INSURANCE
  SERVICE
  SUBSCRIPTION
  VOUCHER
}

enum ProductStatus {
  ACTIVE
  INACTIVE
  OUT_OF_STOCK
  DISCONTINUED
}
```

### 2. Zod Schema (`zod/products.zod.ts`)

- **ProductSchema**: Full validation with all fields
- **CreateProductSchema**: For creating new products (excludes id, timestamps)
- **UpdateProductSchema**: For updating products (all fields optional)
- **Enums**: ProductType and ProductStatus enums

### 3. Controller (`app/products/products.controller.ts`)

CRUD operations:

- **POST /api/products** - Create product
- **GET /api/products** - Get all products (with pagination, filtering, search)
- **GET /api/products/:id** - Get product by ID (with Redis caching)
- **PUT /api/products/:id** - Update product
- **DELETE /api/products/:id** - Delete product

Features:

- Form data transformation
- Zod validation
- Redis caching
- Activity logging
- Audit logging
- Cache invalidation

### 4. Router (`app/products/products.router.ts`)

RESTful routes with proper HTTP methods

### 5. Seeder (`prisma/seeds/productsSeeder.ts`)

Sample data includes:

- **Electronics**: iPhone 15 Pro Max, MacBook Air M2, LG OLED TV, PlayStation 5
- **Appliances**: Samsung Refrigerator, Whirlpool Washing Machine
- **Furniture**: L-Shape Sofa
- **Insurance**: Comprehensive Health Insurance
- **Services**: Premium Gym Membership
- **Subscriptions**: Netflix Premium
- **Vouchers**: SM Gift Certificate

Total: 11 sample products

### 6. Test File (`tests/products.controller.spec.ts`)

Unit tests for all CRUD operations

### 7. Constants (`config/constant.ts`)

Added error messages, success messages, activity log, and audit log constants for products

## API Endpoints

### Create Product

```http
POST /api/products
Content-Type: application/json

{
  "name": "iPhone 15 Pro",
  "description": "Latest flagship smartphone",
  "category": "Electronics",
  "productType": "PHYSICAL_PRODUCT",
  "price": 69999,
  "currency": "PHP",
  "loanEligible": true,
  "maxLoanTerm": 24,
  "minDownPayment": 20,
  "interestRate": 2.5,
  "brand": "Apple",
  "model": "iPhone 15 Pro",
  "sku": "APL-IP15P-256",
  "imageUrls": ["https://example.com/image.jpg"],
  "specifications": {
    "screen": "6.1-inch",
    "processor": "A17 Pro"
  },
  "status": "ACTIVE",
  "stockQuantity": 50,
  "lowStockAlert": 10
}
```

### Get All Products

```http
GET /api/products?page=1&limit=10&query=iPhone&filter=category:Electronics&sort=price&order=asc
```

Query Parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `query`: Search term (searches name, description, category, brand)
- `filter`: Filter conditions (e.g., `category:Electronics`)
- `sort`: Sort field
- `order`: Sort order (asc/desc)
- `groupBy`: Group results by field
- `fields`: Select specific fields
- `document`: Include documents (default: true)
- `count`: Include count (default: true)
- `pagination`: Include pagination (default: true)

### Get Product by ID

```http
GET /api/products/:id?fields=name,price,brand
```

### Update Product

```http
PUT /api/products/:id
Content-Type: application/json

{
  "price": 65999,
  "status": "ACTIVE",
  "stockQuantity": 45
}
```

### Delete Product

```http
DELETE /api/products/:id
```

## Product Types

### PHYSICAL_PRODUCT

- Electronics (smartphones, laptops, TVs)
- Appliances (refrigerators, washing machines)
- Furniture (sofas, tables)

### INSURANCE

- Health insurance
- Life insurance
- Accident insurance

### SERVICE

- Gym memberships
- Training courses
- Consultation services

### SUBSCRIPTION

- Software subscriptions (Netflix, Spotify)
- Streaming services
- Cloud storage

### VOUCHER

- Gift cards
- Meal vouchers
- Shopping vouchers

## Loan Configuration

Products can be configured with loan eligibility:

- `loanEligible`: Boolean flag
- `maxLoanTerm`: Maximum loan term in months
- `minDownPayment`: Minimum down payment percentage
- `interestRate`: Product-specific interest rate

Example:

```json
{
	"loanEligible": true,
	"maxLoanTerm": 24,
	"minDownPayment": 20,
	"interestRate": 2.5
}
```

## Inventory Management

- `stockQuantity`: Current stock level
- `lowStockAlert`: Alert threshold
- `status`: ACTIVE, INACTIVE, OUT_OF_STOCK, DISCONTINUED

## Running the Seeder

To seed sample products:

```bash
npm run prisma-seed
```

Or run specific seeder:

```bash
npx ts-node prisma/seed.ts
```

## Next Steps

1. Run Prisma migration:

    ```bash
    npx prisma migrate dev --name add_products
    ```

2. Seed sample data:

    ```bash
    npm run prisma-seed
    ```

3. Start the server:

    ```bash
    npm run dev
    ```

4. Test the endpoints using Postman or curl

## Notes

- All products are cached in Redis for performance
- Cache is automatically invalidated on create, update, delete
- Activity and audit logs are created for all operations
- Search functionality works across name, description, category, and brand fields
- Supports flexible specifications using JSON field
