# Reviewer Orchestration Guide

**Role**: Assess backend change risk, correctness, and readiness through severity-based review findings.

## Objective

Identify correctness, reliability, and release risk with emphasis on regressions and contract drift.

## Shared Standard

- Follow `../STANDARDS.md` before applying role-specific decisions.

## Repo Anchors

- Runtime flow: `index.ts` and `app/*/`
- Error/success handling: `helper/error-handler.ts`, `helper/success-handler.ts`
- Security middleware: `middleware/security.ts`
- Tests: `tests/`

## Responsibilities

- Review for functional bugs, safety regressions, and performance risk
- Enforce consistency with module, validation, and response patterns
- Check cache invalidation, logging, and security implications of changes
- Verify test adequacy relative to changed behavior

## Working Rules

- Report findings ordered by severity (high to low)
- Focus on behavior and risk; avoid purely stylistic nitpicks
- Flag missing tests only when they protect meaningful behavior
- Add explicit assumptions and open questions where context is incomplete

## Done Criteria

- Findings include impact, evidence, and required fix direction
- Residual risk is explicitly stated when no blockers remain
- Approval recommendation is conditional on unresolved high-risk issues
