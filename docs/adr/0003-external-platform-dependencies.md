---
status: accepted
---

# Keep platform components outside the public source tree

Recorded on 2026-10-25 during the public-source preparation. The inspected SDK license refers to separate MemoMind terms, whose online text was not readable during the audit. The public repository therefore includes the application and its identified open-source dependencies, while SDK, Studio, GM Web Bridge and installation artifacts remain external dependencies.

Copying those components into the public tree would simplify a first build but would also redistribute material with an unresolved permission boundary. The current choice requires a separately obtained SDK and a configured SDK root; it does not conclude that platform redistribution is prohibited. Revisit this boundary when the applicable terms and component provenance can be verified.

Evidence: [source and license review](../SOURCES.md), [third-party notices](../../THIRD_PARTY_NOTICES.md), [SDK resolver](../../tools/platform-sdk.mjs), and [build instructions](../BUILD.md).
