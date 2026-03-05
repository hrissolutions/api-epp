# Security Guidance

This folder defines mandatory security checks for code and release decisions in this backend.

## Primary References

- Middleware stack: `middleware/security.ts`
- Rate limiting: `middleware/rateLimiter.ts`
- Auth and role guards: `middleware/verifyToken.ts`, `middleware/verifyRole.ts`
- Audit and activity logging: `utils/auditLogger.ts`, `utils/activityLogger.ts`

## Mandatory Checks

- Validate all external input before business logic or persistence.
- Enforce authentication and authorization on protected resources.
- Avoid leaking secrets, tokens, or sensitive personal data in logs and responses.
- Keep rate limiting and request-size controls enabled for relevant surfaces.
- Ensure high-risk mutations are auditable with sufficient event context.

## Release Gate

- No known high-severity security issue remains open at release time.
- Security-impacting changes include abuse-case tests or explicit verification evidence.
- Residual risks are documented with owner and mitigation timeline.
