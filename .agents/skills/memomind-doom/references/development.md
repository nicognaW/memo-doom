# Engine and interaction checks

## Rebuild the engine

1. Follow [BUILD.md](../../../../docs/BUILD.md) to activate the recorded Emscripten version. Check the actual compiler version and the selected Python command. On Windows, set `PYTHONUTF8=1` when Python reads or writes the repository's UTF-8 documentation; this avoids the system-code-page failure observed during preparation.
2. Run the existing engine build script. Its inputs must remain relative to the application working directory so C diagnostics do not embed a developer's absolute path.
3. Run the engine tests and asset checks. For a toolchain or path change, compare generated engine files from two independent directories under the same toolchain. Compare both bytes and runtime behavior; a hash difference alone does not identify a game change.
4. Inspect generated binaries as well as text for local paths. Compare the release's recorded hashes before replacing them. Retain the accepted baseline as provenance; update public build metadata only after verifying the new outputs.

**Done:** both backends build, the relevant real-engine tests pass, and any output differences have an explained cause. A reproducibility claim names the tested toolchain and conditions.

## Change phone controls or HUD

Read [USER_GUIDE.md](../../../../docs/USER_GUIDE.md) for the interaction contract and [ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md) for code ownership. Fire and movement are press/release controls; strafe and run are explicit mode switches. Preserve this distinction when adding keyboard or touch paths.

Exercise changed behavior through Browser Studio, using the browser test script as a starting point. Check a real level, real ammo consumption, release/cancellation, mode feedback, and the relevant pause/disconnect/visibility states. Cover portrait and landscape for layout changes. Read actual engine state for the HUD, including menus, demo playback, stale state, melee, ammo costs, and death where relevant.

Use the simulator screenshots to assess layout. Use the physical glasses to assess their visible image and the phone to assess touch comfort; label each result. The source tests and browser regression already cover many of these cases, so extend the existing coverage only where the change leaves a meaningful gap.

**Done:** the changed control or HUD behavior passes its relevant existing tests and browser interaction, with physical observations reported separately. A visual screen alone is insufficient evidence that fire stops or ammo counts are real.
