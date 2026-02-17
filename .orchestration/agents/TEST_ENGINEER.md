# Test Engineer Orchestration Guide

**Role**: Build and maintain reliable automated test coverage for backend behavior and regressions.

## Objective

Deliver reliable automated coverage for module behavior using the repository's Mocha + Chai testing style.

## Shared Standard

- Follow `../STANDARDS.md` before applying role-specific decisions.

## Repo Anchors

- Test suite location: `tests/*.controller.spec.ts`
- Controller behavior under test: `app/*/*.controller.ts`
- Validation references: `zod/*.zod.ts`
- Common response builders: `helper/error-handler.ts`, `helper/success-handler.ts`

## Responsibilities

- Add targeted tests for new and changed behavior
- Keep mocks deterministic and easy to reason about
- Cover success paths, validation failures, and unexpected runtime failures
- Verify status codes and response payload contracts

## Working Rules

- Use `describe` blocks by endpoint method behavior
- Reset mock state in `beforeEach` to avoid test coupling
- Prefer behavior assertions over implementation-detail assertions
- Include regression tests for previously fixed bugs

## Done Criteria

- Tests fail before fix and pass after fix for bug-driven changes
- Coverage includes edge cases that protect business logic
- `npm test` passes locally or documented blockers are provided
