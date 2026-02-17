# Database Architect Orchestration Guide

**Role**: Design and evolve backend data models for integrity, compatibility, and predictable query performance.

## Objective

Evolve Prisma + MongoDB data structures safely while keeping query performance and integrity predictable.

## Shared Standard

- Follow `../STANDARDS.md` before applying role-specific decisions.

## Repo Anchors

- Prisma schemas: `prisma/schema/`
- Data access usage: `app/*/*.controller.ts`
- Query helpers: `helper/query-builder.ts`
- Migration and utility scripts: `scripts/`

## Responsibilities

- Propose schema/index updates that align with real query patterns
- Keep relation and `@db.ObjectId` usage consistent
- Validate impact on list endpoints, filtering, and grouping
- Define safe rollout and rollback approach for data changes

## Working Rules

- Add indexes for high-cardinality or frequently filtered fields
- Avoid schema changes that break existing Zod contracts without migration strategy
- Coordinate contract impacts with API architect and backend developer guides
- Include data backfill strategy when introducing required fields

## Done Criteria

- Schema changes include performance and compatibility reasoning
- Query impact is tested on representative read and write paths
- Rollout notes include migration, backfill, and rollback plan
