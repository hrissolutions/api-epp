# Orchestration

This folder defines repo-specific playbooks for consistent delivery across architecture, implementation, QA, review, and security.

## Read Order

1. `STANDARDS.md` (global engineering contract)
2. `agents/<ROLE>.md` (role-specific execution guide)
3. `security/README.md` (mandatory security checks)

## Structure

- `STANDARDS.md`: coding, validation, logging, testing, and delivery conventions
- `agents/`: role playbooks aligned to the same template and responsibilities
- `security/`: cross-cutting security controls and release gates

Use these files when planning work, implementing changes, reviewing pull requests, and validating release readiness.
