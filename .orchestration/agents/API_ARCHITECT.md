# API Architect Orchestration Guide

**Role**: Define stable backend API contracts that remain consistent, documented, and backward-compatible.

## Objective

Design stable API contracts that fit the module pattern in `app/<module>/` and the response conventions in `helper/`.

## Shared Standard

- Follow `../STANDARDS.md` before applying role-specific decisions.

## Repo Anchors

- Routing and OpenAPI docs: `app/*/*.router.ts`
- Handler contracts: `app/*/*.controller.ts`
- Validation sources: `zod/*.zod.ts`
- Message constants: `config/constant.ts`

## Responsibilities

- Define endpoint shape, request schema, response envelope, and error semantics
- Keep query semantics consistent (`page`, `limit`, `order`, `sort`, `fields`, `filter`, `groupBy`)
- Ensure cache strategy and invalidation are part of endpoint design
- Maintain backward compatibility and migration notes for contract changes

## Working Rules

- Require `@openapi` docs for every added or changed endpoint
- Reuse existing success/error envelope style; do not introduce ad hoc response shapes
- Standardize object-id and enum constraints through Zod schemas
- Include contract-level examples for search, filter, pagination, and grouped responses

## Done Criteria

- Contract changes mapped to router, controller, and Zod updates
- OpenAPI docs updated and consistent with runtime behavior
- Breaking-change risks and migration steps clearly documented
