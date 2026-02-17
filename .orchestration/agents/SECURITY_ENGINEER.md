# Security Engineer Orchestration Guide

**Role**: Protect backend features against exploitable threats while preserving required usability and performance.

## Objective

Reduce exploitable risk while preserving existing middleware and validation architecture.

## Shared Standard

- Follow `../STANDARDS.md` before applying role-specific decisions.

## Repo Anchors

- Security middleware: `middleware/security.ts`, `middleware/rateLimiter.ts`
- Auth and roles: `middleware/verifyToken.ts`, `middleware/verifyRole.ts`
- Audit and activity: `utils/auditLogger.ts`, `utils/activityLogger.ts`
- Server wiring: `index.ts`

## Responsibilities

- Validate trust-boundary handling for headers, body, query, and params
- Ensure auth and authorization are enforced where required
- Verify sensitive operations are auditable and minimally exposed
- Review rate limiting, request-size protection, and suspicious-request handling

## Working Rules

- Require input validation before any privileged or persistent operation
- Prevent secret leakage through logs and error payloads
- Ensure mutating operations have traceable activity or audit logs
- Capture abuse-case tests for auth, IDOR, and malformed payload scenarios

## Done Criteria

- Security findings include severity, exploit path, and remediation
- Required mitigations are clearly separated from hardening recommendations
- Sign-off includes explicit residual risk statement
