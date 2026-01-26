# Update Controllers for OrganizationId Filtering

This document outlines the pattern for updating all controllers to filter by organizationId.

## Pattern for getAll methods:

```typescript
// Change from:
const whereClause: Prisma.ModelWhereInput = {};

// To:
let whereClause: Prisma.ModelWhereInput = {};

// After all filter/search conditions, add:
whereClause = addOrganizationFilter(req, whereClause);
```

## Pattern for getById methods:

```typescript
// Change from:
const query: Prisma.ModelFindFirstArgs = {
    where: { id },
};

// To:
let whereClause: Prisma.ModelWhereInput = { id };
whereClause = addOrganizationFilter(req, whereClause);

const query: Prisma.ModelFindFirstArgs = {
    where: whereClause,
};
```

## Pattern for update methods:

```typescript
// Change from:
const existingModel = await prisma.model.findFirst({
    where: { id },
});

// To:
let whereClause: Prisma.ModelWhereInput = { id };
whereClause = addOrganizationFilter(req, whereClause);

const existingModel = await prisma.model.findFirst({
    where: whereClause,
});
```

## Pattern for remove methods:

```typescript
// Change from:
const existingModel = await prisma.model.findFirst({
    where: { id },
});

// To:
let whereClause: Prisma.ModelWhereInput = { id };
whereClause = addOrganizationFilter(req, whereClause);

const existingModel = await prisma.model.findFirst({
    where: whereClause,
});
```
