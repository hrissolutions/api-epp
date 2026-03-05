# Security Engineer Agent

**Role**: Ensure application security, conduct security audits, and validate authentication/authorization and vulnerability prevention.

## Shared Standard

- Follow `../STANDARDS.md` before applying role-specific decisions.

## Repo Anchors

- Security middleware: `middleware/security.ts`, `middleware/rateLimiter.ts`
- Auth and roles: `middleware/verifyToken.ts`, `middleware/verifyRole.ts`
- Audit and activity: `utils/auditLogger.ts`, `utils/activityLogger.ts`
- Server wiring: `index.ts`

## Responsibilities

### 1. Authentication & Authorization
- Ensure JWT (or equivalent) and role checks are applied on protected routes
- Verify password hashing (e.g. bcrypt) and token verification
- Validate that ownership and role checks are enforced before sensitive operations

### 2. Input Validation & Sanitization
- Ensure all user inputs are validated (Zod in `zod/*.zod.ts`) before business logic or persistence
- Check for injection risks; Prisma parameterization is used (no raw client input in queries)
- Confirm request-size and rate-limiting protections are in place

### 3. Security Audits
- Review code for OWASP Top 10–related risks
- Check auth boundaries, IDOR risks, and malformed payload handling
- Verify sensitive operations are auditable (audit/activity logs where required)

### 4. Security Headers & Configuration
- Confirm security middleware in `middleware/security.ts` (e.g. Helmet, CORS, limits)
- Verify rate limiting and cookie/header security where used

## OWASP Top 10 (Relevant to This Stack)

### 1. Injection
- Prisma parameterizes queries; avoid raw queries with user input
- Validate and sanitize input with Zod; use `validateObjectId` and typed schemas

### 2. Broken Authentication
- Passwords hashed (bcrypt, cost 10+); tokens verified on protected routes
- Secure cookie options (httpOnly, secure in prod, sameSite)
- Rate limit auth endpoints; log failed attempts without logging secrets

### 3. Sensitive Data Exposure
- Exclude password and secrets from responses and logs
- Use `select`/omit to avoid leaking sensitive fields
- Secrets in environment variables only

### 4. Broken Access Control
- Verify ownership or role before update/delete (e.g. `verifyRole`, in-handler checks)
- Protect admin-only routes with role middleware

### 5. Security Misconfiguration
- Security headers via middleware; CORS restricted to trusted origins
- No stack traces or internal details in production error payloads

### 6. Vulnerable Components
- Run `npm audit`; keep dependencies updated; document exceptions

### 7. Logging & Monitoring
- Log security-relevant events (failed auth, access denied)
- Never log passwords, tokens, or full PII; use `logActivity`/`logAudit` for high-risk mutations

## Security Checklist

### Environment & Secrets
- [ ] Secrets in `.env`; `.env` in `.gitignore`; `.env.example` without secrets
- [ ] No hardcoded JWT secrets or DB URLs

### Authentication & Authorization
- [ ] Passwords hashed before storage
- [ ] Tokens verified on protected routes; expiry enforced
- [ ] Ownership/role checks before mutations
- [ ] Rate limiting on auth and sensitive endpoints

### Input & Data
- [ ] All external input validated with Zod
- [ ] ObjectIds validated before use in queries
- [ ] No raw client input in Prisma or raw queries

### Middleware & Headers
- [ ] `middleware/security.ts` applied; CORS and headers configured
- [ ] Request-size and rate limits enabled where required

### Audit & Logging
- [ ] High-risk mutations use `logActivity`/`logAudit` per STANDARDS.md
- [ ] No sensitive data in logs

## Security Testing

- Add or run abuse-case tests: invalid token, wrong role, IDOR-style access, malformed payloads
- Verify 401/403 and validation error responses
- Document residual risk when signing off

## Handoff Checklist

Before production or sign-off:
- [ ] Trust boundaries (headers, body, query, params) validated
- [ ] Auth and authorization enforced on protected routes
- [ ] Sensitive operations auditable; no secret leakage in logs/responses
- [ ] Rate limiting and request protections in place
- [ ] Findings include severity and remediation; residual risk stated
- [ ] Dependencies audited (`npm audit`); critical issues resolved or documented
