# AI Orchestration System

This directory contains the AI agent orchestration system for the backend. Use it for consistent delivery across architecture, implementation, QA, review, and security.

## Structure

```
.orchestration/
├── agents/                    # Specialized AI agent roles
│   ├── API_ARCHITECT.md       # API contracts, endpoints, OpenAPI
│   ├── DATABASE_ARCHITECT.md  # Prisma schemas and data modeling
│   ├── BACKEND_DEVELOPER.md   # Module implementation and business logic
│   ├── SECURITY_ENGINEER.md   # Security audits and best practices
│   ├── TEST_ENGINEER.md       # Testing strategies and implementation
│   ├── REVIEWER.md            # Code review and release readiness
│   ├── QA.md                  # Quality assurance and validation
│   └── PM.md                  # Planning, scope, and delivery
├── security/                  # Security documentation
│   └── README.md              # Mandatory security checks and release gate
├── ARCHITECTURE.md            # System architecture overview
├── STANDARDS.md               # Primary engineering contract (coding, validation, testing)
└── README.md                  # This file
```

## Read Order

1. **STANDARDS.md** – Global engineering contract for all roles.
2. **agents/<ROLE>.md** – Role-specific execution guide when doing that role’s work.
3. **security/README.md** – Mandatory security checks before release.

## How to Use

### 1. Agent Roles

Each agent file defines a specialized role with:

- **Objective** – What this agent is for
- **Responsibilities** – What this agent handles
- **Repo anchors** – Key files and folders
- **Working rules** – How to approach tasks
- **Done criteria** – When the role’s work is complete

### 2. Invoking Agents

When working on a task, reference the appropriate agent:

```
@API_ARCHITECT      – Design or change API contracts and OpenAPI
@DATABASE_ARCHITECT – Change Prisma schemas and data models
@BACKEND_DEVELOPER  – Implement or fix features in app/<module>/
@SECURITY_ENGINEER  – Security review or hardening
@TEST_ENGINEER      – Add or update tests
@REVIEWER           – Review changes and release readiness
@QA                 – Validate quality and acceptance
@PM                 – Plan scope, milestones, and delivery
```

### 3. Security Protocols

Always consult **security/README.md** before:

- Adding or changing authentication/authorization
- Handling external input or persistence
- Changing middleware or rate limiting
- Releasing or documenting security-impacting changes

### 4. Architecture

See **ARCHITECTURE.md** for:

- System overview
- Module layout and layer responsibilities
- Data flow and technology stack

## Workflow Example

```mermaid
graph LR
    A[Request] --> B[@PM]
    B --> C[@API_ARCHITECT]
    C --> D[@DATABASE_ARCHITECT]
    D --> E[@BACKEND_DEVELOPER]
    E --> F[@TEST_ENGINEER]
    F --> G[@REVIEWER]
    G --> H[@QA]
    H --> I[@SECURITY_ENGINEER]
    I --> J[Release]
```

- **Design first**: API and database design before implementation.
- **Security in the loop**: Security checks before release.
- **Test as you build**: Test engineer after implementation.
- **Review before merge**: Reviewer and QA before release.

## Best Practices

1. **Start with STANDARDS.md** – All roles follow it before role-specific rules.
2. **Design before implementing** – Use API_ARCHITECT and DATABASE_ARCHITECT for contract and schema changes.
3. **Security in scope** – Consult security/README.md and SECURITY_ENGINEER for sensitive or high-risk work.
4. **Test with implementation** – Invoke TEST_ENGINEER after BACKEND_DEVELOPER changes.
5. **Review before merge** – Use REVIEWER and QA; resolve high-severity findings.
6. **Keep contracts in sync** – When API or schema changes, update router, controller, Zod, OpenAPI, and tests together.
7. **Use repo anchors** – Each agent points at the same paths (app/, zod/, helper/, middleware/, etc.); stay within that layout.

## Current Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **ORM**: Prisma (MongoDB)
- **Validation**: Zod (`zod/*.zod.ts`)
- **Testing**: Mocha + Chai (`tests/**/*.spec.ts`)
- **Documentation**: OpenAPI (JSDoc `@openapi` on routes)
- **Formatting/Linting**: Prettier + ESLint

## Delivery Checklist

- Changes stay within the existing module architecture (`app/<module>/`).
- API or schema changes include router, controller, Zod, and OpenAPI updates.
- Run at least: `npm run lint`, `npm test`.
- If any step is skipped, document why and list follow-up verification steps.
- No known high-severity security issues at release; security-impacting changes are validated per security/README.md.
