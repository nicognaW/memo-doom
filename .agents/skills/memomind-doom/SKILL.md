---
name: memomind-doom
description: Set up memo-doom, preview with the external MemoMind SDK, rebuild its engine, change controls or HUD, or deliver a paired installation package and usable install QR code.
---

# memo-doom

Use the repository root as the working directory. Read [GLOSSARY.md](../../../GLOSSARY.md) for domain terms. Commands, dependency versions, and declared platform capabilities come from `package.json`, `manifest.json`, and the build tools; the linked documents explain their use.

## 1. Choose the path

Read `git status --short --branch`, then the relevant entry below. Identify the requested outcome and existing changes before editing.

| Outcome | Read |
| --- | --- |
| Set up or test source without glasses | [BUILD.md: resources and engine](../../../docs/BUILD.md) |
| Preview or build the phone package | [BUILD.md: platform dependencies](../../../docs/BUILD.md) |
| Rebuild the C engine or change game behavior | [Engine and interaction checks](references/development.md) |
| Install on a phone and glasses, or deliver an application update | [Installation delivery](references/delivery.md) |
| Find the source of a failure | [Troubleshooting](references/troubleshooting.md) |

**Done:** select the necessary paths and state the evidence each can establish. Source tests, Browser Studio, and the physical glasses are separate verification levels.

## 2. Establish the baseline

Follow the source-only setup in [BUILD.md](../../../docs/BUILD.md). Use the lockfile and run the repository's existing tests and asset verification. For documentation-only work, inspect the relevant files and links; reuse the recorded test baseline instead of claiming a new run.

For platform work, locate the user's existing external SDK and set `MEMOMIND_SDK_ROOT` as described in BUILD.md. Validate the tools used by the requested command before starting it. The SDK remains outside the public source tree.

**Done:** report successful checks by name, or identify the missing prerequisite and continue work that does not depend on it. A successful source setup does not establish a working MemoMind installation.

## 3. Build or change the selected path

Follow the chosen reference and use existing scripts. Keep application changes in this repository; treat the SDK and Studio as external dependencies. Use [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) to locate ownership before changing behavior.

For a player walkthrough, follow [USER_GUIDE.md](../../../docs/USER_GUIDE.md): obtain the required permissions, start DOOM, enter a real level through the menu, then exercise movement, firing, HUD, and pause/resume. Check observable player state rather than only the launch screen.

**Done:** the requested behavior is observable at the selected verification level, and all changed controls or lifecycle paths have been exercised. For an installation or application update, also complete the delivery reference.

## 4. Close with evidence

Run `npm run verify:public`, then review the actual diff and generated files. Keep platform binaries, temporary QR images, local addresses, account data, and user IWADs in their ignored/private delivery locations. Read [SOURCES.md](../../../docs/SOURCES.md) before changing third-party contents or distributing platform components.

Report the changed behavior, checks actually run, artifact paths, and remaining limits. Record a historical explanation as a retrospective reconstruction with its source, not as an interview or commit that happened earlier. A source/documentation change does not establish a newly verified physical-device build.

**Done:** each completion claim has concrete output or observation; the public-file check passes and the public diff contains only intended source, documentation, and permitted assets. Installable application updates include the usable install QR code required by [INSTALL.md](../../../docs/INSTALL.md).
