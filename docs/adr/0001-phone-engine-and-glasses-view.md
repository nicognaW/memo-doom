---
status: accepted
---

# Run the game on the phone and send the glasses view

Retrospectively recorded on 2026-10-25 from the accepted 0.1.5 implementation. The phone owns the game simulation and phone controller; the existing GM Web Bridge provides the glasses view. This keeps local input and the phone HUD beside the game state, but makes glasses updates depend on the display link.

A native glasses engine would change the execution target and plugin boundary, not just the quality mode. The current source tree does not establish that this alternative was prototyped or benchmarked.

Evidence: [architecture](../ARCHITECTURE.md), [phone entry point](../../src/plugin.js), [engine platform layer](../../engine/doomgeneric_memomind.c), and [display sender](../../src/glass-display.js).
