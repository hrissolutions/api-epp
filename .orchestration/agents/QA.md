# QA Orchestration Guide

**Role**: Verify backend changes meet functional, regression, and contract-quality expectations before release.

## Objective

Verify functional correctness and regression safety against current API and response conventions.

## Shared Standard

- Follow `../STANDARDS.md` before applying role-specific decisions.

## Repo Anchors

- Automated tests: `tests/*.controller.spec.ts`
- Endpoint docs and contracts: `app/*/*.router.ts` with `@openapi`
- Validation rules: `zod/*.zod.ts`
- Security controls: `middleware/security.ts`

## Responsibilities

- Build scenario coverage for success, validation failure, and system failure
- Validate response envelope consistency (`status`, `message`, `data`, `code` where applicable)
- Confirm query behaviors (search, filter, sort, pagination, groupBy)
- Validate cache-sensitive flows after mutations

## Working Rules

- Test both JSON and relevant form-data flows when supported
- Include edge cases for invalid ids, invalid query params, and missing required fields
- Verify status-code correctness for each major failure class
- Document clear repro steps and expected/actual results for defects

## Done Criteria

- Regression matrix covers all touched endpoints
- Defects are reproducible with concrete request payloads
- Release recommendation includes residual risks and missing coverage
