## Summary

```diff
 README.md
- Chinese project overview with features and build commands
+ Plain-English reader path: what it is → play → try source → limits → license
 README.zh-CN.md
+ Chinese companion with the same setup and controls
```

Readers can distinguish a source checkout, Browser Studio preview, and Paired installation package before they run a command. The PR template is used for this review record; it does not dictate the README structure.

## Evidence

- **Before:** `README.md` was Chinese-only. Its opening feature list preceded the hardware and platform requirements; it did not name the missing live Install QR code.
  **After:** Both language versions explain the phone/game/glasses roles first, state the required components, and distinguish source checks from SDK preview and installation. The existing Phone HUD screenshot is labeled as a Browser Studio simulation.
- **Before:** Readers had to infer which tools were needed for `npm test` and which were needed for `npm run build`.
  **After:** The source-check block needs only Node.js 20+. The preview block sets `MEMOMIND_SDK_ROOT`; Python and Emscripten are described under the tasks that need them. Script names and requirements were checked against `package.json` and `docs/BUILD.md`.

This is a documentation review record. It adds no game-runtime test result or claim of a new physical-device installation.

The local Markdown/image targets and README npm commands were checked against the filesystem and package scripts. First-party whitespace validation passed for the edited files.

## Merge Danger

**Door:** two-way

The README changes are reversible and do not change controls, game data, or engine output.

**Blast Radius:** onboarding

Incorrect prerequisites or translations could block a reader's first build. Both versions retain the external SDK requirement, Paired installation package boundary, and component license notices.
