## Summary

The accepted application is now an independent source repository with a readable entry point, traceable decisions and a project skill for agents.

```text
README.md / README.zh-CN.md  → play, source checks and installation path
GLOSSARY.md                 → shared project terms
docs/adr/                   → architectural decisions
docs/decisions/              → feedback, corrections and open choices
docs/retrospective.md        → environment findings and implemented checks
.agents/skills/              → agent setup, development and installation paths
tools/verify-public.mjs      → deterministic publication checks
```

## Evidence

- **Before:** Source was staged without a maintainer identity or commit history; the README mixed source preparation with player guidance. History and decision context were spread across the development conversation.
  **After:** Maintainer identity was resolved from the user-supplied GitHub profile. Current-time import commits are separated by review scope, with provenance explained in [COMMIT_HISTORY.md](../COMMIT_HISTORY.md). English/Chinese reader guides, retrospective records and agent references have checked local links.
- **Before:** A one-time scan found local compiler paths, but the CI job had no publication-boundary or Markdown-link check.
  **After:** `npm run verify:public` is wired into CI. Local fixtures demonstrate rejection of an installation artifact, an embedded binary local path, a missing link and invalid first-party module syntax; the clean fixture passes.
- **Before:** The accepted game already had 34 passing application/engine tests and local browser evidence.
  **After:** The gameplay sources remain unchanged. This work adds documentation and checks; it does not establish a new physical-device installation or a hosted GitHub Actions result.

## Merge Danger

**Door:** two-way

Documentation and local tooling can be revised. No remote publication or game data migration occurs.

**Blast Radius:** repository

The public-file check adds a CI requirement. It scans tracked files for selected patterns and validates local Markdown targets; it is not a complete credential detector or a license determination. Platform components remain external.
