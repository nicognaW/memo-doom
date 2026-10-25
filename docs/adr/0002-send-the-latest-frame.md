---
status: accepted
---

# Send the latest frame instead of accumulating old images

Retrospectively recorded on 2026-10-25 from the accepted 0.1.5 implementation. The display pipeline retains the latest pending image while a send is in progress. It favors a current glasses view over completing every image produced by the engine; a discarded frame is therefore not evidence of a transmission error.

Keeping every image would preserve image history at the cost of delay when production exceeds link capacity. This is the trade-off expressed by the code, not a claim that both strategies were compared in a controlled device experiment. The completed display frame count remains separate from physical panel refresh.

Evidence: [source-frame replacement](../../src/plugin.js), [display-frame replacement](../../src/glass-display.js), [display tests](../../tests/glass-display.test.mjs), and [validation boundaries](../VALIDATION.md).
