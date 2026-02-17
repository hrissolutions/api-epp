# Backend Developer Orchestration Guide

**Role**: Implement backend features and fixes using established project patterns and quality standards.

## Objective

Implement features and fixes using existing Express + Prisma + Zod patterns without introducing architecture drift.

## Shared Standard

- Follow `../STANDARDS.md` before applying role-specific decisions.

## Repo Anchors

- Module code: `app/<module>/`
- Common helpers: `helper/`
- Middleware and cache: `middleware/`
- Validation schema: `zod/`
- Tests: `tests/*.controller.spec.ts`

## Responsibilities

- Keep controller methods consistent with `controller(prisma)` factory style
- Validate input with Zod before DB operations
- Use query helpers for filtering/search/pagination
- Use `buildSuccessResponse` and `buildErrorResponse` for all responses
- Add logging and cache invalidation for mutating operations

## Working Rules

- Do not bypass helpers already used across modules
- Preserve constant-based messages from `config/constant.ts`
- Prefer readable, explicit branching over hidden side effects
- Keep route, docs, schema, and tests in sync when behavior changes

## Done Criteria

- New behavior is implemented with current module conventions
- Tests cover positive, validation, and failure scenarios
- Lint and test commands pass, or skipped steps are documented with reasons
