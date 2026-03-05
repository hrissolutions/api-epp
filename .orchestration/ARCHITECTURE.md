# System Architecture

High-level overview of the backend for orchestration and onboarding.

## Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **ORM**: Prisma (MongoDB)
- **Validation**: Zod
- **Testing**: Mocha + Chai
- **Docs**: OpenAPI (JSDoc `@openapi` on routes)

## Project Layout

```
backend/
├── app/<module>/           # Feature modules
│   ├── index.ts            # Exports <module>Module(prisma): Router
│   ├── <module>.controller.ts
│   └── <module>.router.ts
├── config/                 # Constants, env, config
├── generated/prisma       # Prisma client (generated)
├── helper/                 # Shared utilities
│   ├── query-builder.ts    # buildFindManyQuery, buildFilterConditions, etc.
│   ├── success-handler.ts  # buildSuccessResponse, buildPagination
│   ├── error-handler.ts    # buildErrorResponse, formatZodErrors
│   ├── validation-helper.ts
│   └── ...
├── middleware/             # Express middleware (security, cache, auth, etc.)
├── prisma/schema/          # Prisma schema
├── utils/                  # Cross-cutting (e.g. auditLogger, activityLogger)
├── zod/                    # Zod schemas (*.zod.ts)
└── tests/                  # Mocha specs (*.spec.ts)
```

## Layer Responsibilities

| Layer        | Location              | Responsibility |
|-------------|------------------------|----------------|
| **Routes**  | `app/*/*.router.ts`    | Mount routes, apply middleware, document with `@openapi` |
| **Controllers** | `app/*/*.controller.ts` | Request handling, Zod validation, call Prisma/helpers, respond via success/error helpers |
| **Helpers** | `helper/`              | Query building, pagination, validation, business utilities |
| **Data**    | Prisma + `prisma/schema/` | Persistence and schema |
| **Validation** | `zod/*.zod.ts`      | Request/query schemas; shared with controllers |

## Data Flow

1. **Request** → Router (middleware: security, auth, rate limit, cache where applicable).
2. **Controller** → Validate input (Zod), build query (helper/query-builder), call Prisma.
3. **Response** → buildSuccessResponse / buildPagination or buildErrorResponse; constants from config.
4. **Mutations** → Logging/audit where required; cache invalidation for affected keys.

## Module Pattern

- Each module is self-contained under `app/<module>/`.
- Entrypoint: `index.ts` exports `function <module>Module(prisma: PrismaClient): Router`.
- Controller is a factory: `controller(prisma)` returns handler methods.
- Router is a function: `router(route: Router, controller: IController): Router`.
- Main app wires modules by calling each `*Module(prisma)` and mounting the returned Router.

## Security and Observability

- **Middleware**: `middleware/security.ts` (and related) apply request validation, size limits, and protection.
- **Auth**: Token and role checks via middleware; use on protected routes.
- **Logging**: Module loggers from `helper/logger`; audit/activity via `utils/` where needed.
- **Caching**: Read endpoints via cache middleware; invalidate on create/update/delete with stable key patterns.

## References

- **STANDARDS.md** – Controller/router contract, validation, logging, testing, delivery.
- **security/README.md** – Mandatory security checks and release gate.
- **agents/** – Role-specific guides (API_ARCHITECT, DATABASE_ARCHITECT, BACKEND_DEVELOPER, etc.).
