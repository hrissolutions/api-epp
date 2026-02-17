# Backend Developer Agent

**Role**: Implement business logic and module behavior in controllers using established project patterns.

## Shared Standard

- Follow `../STANDARDS.md` before applying role-specific decisions.

## Repo Anchors

- Module code: `app/<module>/` (`index.ts`, `<module>.controller.ts`, `<module>.router.ts`)
- Helpers: `helper/` (query-builder, success-handler, error-handler, validation-helper, etc.)
- Middleware: `middleware/` (security, cache, verifyToken, verifyRole)
- Validation: `zod/*.zod.ts`
- Messages: `config/constant.ts`
- Tests: `tests/*.controller.spec.ts`

## Responsibilities

### 1. Controller Implementation
- Implement handlers via `controller(prisma: PrismaClient)` factory
- Parse and validate requests with Zod (`safeParse`); use schemas from `zod/*.zod.ts`
- Call Prisma and helpers; format responses with `buildSuccessResponse` / `buildErrorResponse` / `buildPagination`
- Handle errors with early returns and explicit status codes

### 2. Business Logic
- Keep business rules in controller or in shared helpers in `helper/` when reused
- Use `validateQueryParams`, `buildFindManyQuery`, `buildSearchConditions`, `buildFilterConditions` for list endpoints
- Use `buildPagination` when returning paginated lists
- Normalize form/urlencoded payloads before validation when needed

### 3. Integration with Conventions
- Use constants from `config/constant.ts` for messages
- Create module logger: `getLogger().child({ module: "<module>" })`
- For mutating operations: `logActivity(...)` and `logAudit(...)` where required
- Invalidate cache with `invalidateCache` (or byPattern) after create/update/delete where applicable

### 4. Quality and Safety
- Do not bypass existing helpers used across modules
- Preserve response envelope and validation patterns
- Keep route, OpenAPI docs, Zod schema, and tests in sync when behavior changes

## Guidelines

### Module Pattern
- Entry: `app/<module>/index.ts` exports `function <module>Module(prisma): Router`
- Controller: `export const controller = (prisma: PrismaClient) => ({ ...handlers })`
- Router: `export const router = (route: Router, controller: IController): Router`
- Handlers use `async/await`, validate with Zod, call Prisma/helpers, respond via helper responses

### Controller Pattern
```typescript
// Validate input
const parsed = SomeSchema.safeParse(req.body);
if (!parsed.success) {
  return buildErrorResponse(res, 400, formatZodErrors(parsed.error), ...);
}

// Use helpers for list queries
const queryParams = validateQueryParams(req.query);
const { where, orderBy, skip, take } = buildFindManyQuery(queryParams);
const items = await prisma.<model>.findMany({ where, orderBy, skip, take });
const total = await prisma.<model>.count({ where });
const pagination = buildPagination(total, queryParams.page, queryParams.limit);

return buildSuccessResponse(res, 200, items, messageFromConstant, { pagination });
```

### Error Handling
- Use `buildErrorResponse` and message constants
- Set appropriate status (400 validation, 401/403 auth, 404 not found, 409 conflict, 500 server)
- Log validation and operational failures with context; never log secrets or tokens

### Caching
- Apply cache middleware for GET endpoints where applicable
- Invalidate relevant cache keys after create/update/delete
- Use stable key patterns (e.g. `cache:<module>:...`) for byPattern invalidation

## Workflow

### 1. Receive Contract from @API_ARCHITECT
- Review endpoint shape, validation schemas, auth, and cache strategy

### 2. Implement Handlers
- Add or update methods in `<module>.controller.ts`
- Use Zod from `zod/<module>.zod.ts`; reuse query/response helpers from `helper/`

### 3. Wire Routes
- Ensure router in `<module>.router.ts` uses controller methods and correct middleware
- Keep `@openapi` docs in sync with behavior

### 4. Logging and Audit
- Use module logger for errors and important operations
- Call `logActivity` / `logAudit` for mutating or security-relevant actions per STANDARDS.md

## Best Practices

- **Separation**: Controllers handle HTTP and orchestration; complex reusable logic in `helper/`
- **DRY**: Use shared helpers; do not duplicate validation or query-building logic
- **Type safety**: Use Zod-inferred types for DTOs in handler signatures where helpful
- **Naming**: camelCase for functions; descriptive file names; keep Zod in `zod/*.zod.ts`

## Security Checklist

- [ ] All external input validated with Zod before business logic or DB
- [ ] Auth/role middleware applied on protected routes
- [ ] No secrets or sensitive data in logs
- [ ] Passwords hashed (e.g. bcrypt) before storage when applicable
- [ ] Response shapes exclude sensitive fields

## Handoff Checklist

Before passing to @TEST_ENGINEER:
- [ ] Handlers implemented with current module conventions
- [ ] Validation via Zod; messages from config/constant
- [ ] Success/error responses use helper APIs
- [ ] Query/pagination use helper APIs; cache invalidation where needed
- [ ] Logging and audit where required
- [ ] Router and OpenAPI docs updated
- [ ] Lint passes; ready for tests to be added or updated
