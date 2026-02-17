# Backend Standards

Use this as the primary engineering contract for all orchestration roles in this repository.

## Stack And Tooling

- TypeScript + Express + Prisma (MongoDB) + Zod
- Formatting and linting must match `.prettierrc` and `eslint.config.js`
- Tests run with Mocha + Chai from `tests/**/*.spec.ts`

## Project Layout

- API modules live in `app/<module>/`
- Module entrypoint is `app/<module>/index.ts` and exports `<module>Module(prisma)`
- Main files per module:
  - `<module>.controller.ts`
  - `<module>.router.ts`
- Validation schemas live in `zod/*.zod.ts`
- Prisma schema lives under `prisma/schema/`
- Shared utilities are in `helper/`, `middleware/`, and `utils/`

## Controller Contract

- Export `controller(prisma: PrismaClient)` and return handler methods
- Use `async/await`, early returns, and explicit status codes
- Validate input with Zod `safeParse`
- For form or urlencoded payloads, normalize request data before validation
- Use standardized responses:
  - `buildSuccessResponse(...)`
  - `buildErrorResponse(...)`
- Use constants from `config/constant.ts` for messages

## Router Contract

- Export `router(route: Router, controller: IController): Router`
- Keep route path stable and explicit (for example `/order`)
- Add `@openapi` JSDoc for each endpoint
- Apply cache middleware for GET endpoints where applicable
- Preserve predictable cache keys for invalidation patterns

## Query, Filtering, And Pagination

- Use `validateQueryParams(...)` before query execution
- Build Prisma list queries with `buildFindManyQuery(...)`
- Use `buildSearchConditions(...)` and `buildFilterConditions(...)`
- Return pagination with `buildPagination(...)` when requested

## Logging And Auditability

- Create module logger from `getLogger().child({ module: "<module>" })`
- Log validation and operational failures with actionable context
- For mutating endpoints, include:
  - activity log via `logActivity(...)`
  - audit log via `logAudit(...)` where business/security relevant

## Security Baseline

- Respect middleware stack in `middleware/security.ts`
- Never bypass request validation for external inputs
- Enforce auth/role middleware where endpoint requires protection
- Avoid logging secrets, tokens, or sensitive personal data
- Keep request-size and suspicious-request protections intact

## Caching Rules

- Cache read endpoints using `middleware/cache`
- Invalidate relevant keys after create/update/delete
- Use stable key patterns like `cache:<module>:...` to support `byPattern(...)`

## Testing Baseline

- Add/update tests in `tests/<module>.controller.spec.ts` for changed behavior
- Cover success path, validation errors, and failure paths
- Mock Prisma interactions in `beforeEach`
- Validate response shape (`status`, `data`, `message`) and HTTP status

## Delivery Checklist

- Keep changes within existing module architecture
- Include schema and docs updates when API contract changes
- Run at least:
  - `npm run lint`
  - `npm test`
- If skipped, document why and list follow-up verification steps
