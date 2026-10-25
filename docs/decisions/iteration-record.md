# Iteration record

Retrospectively recorded on 2026-10-25. Version order comes from the development conversation and [change log](../../CHANGELOG.md); no missing dates, authors, review meetings or experiments have been invented. The observations below are paraphrases of user feedback, not interview transcripts.

## From slow glasses updates to an accepted display baseline

**Observed:** The user reported slow glasses updates in Native mode. An early screenshot showed about 2.3 completed display frames/s, 19.8 KiB/frame and a 445 ms send; a later Smooth mode screenshot showed about 6.0 frames/s, 10.3 KiB/frame and 142 ms. These were different runs, not a controlled benchmark.

**Changed:** Version 0.1.2 reduced image detail in Smooth mode while preserving the field of view and Native display size. It retained the existing glasses companion and display channel.

**User decision:** The result was much smoother. The user then explicitly stopped frame-rate optimization and asked for clearer game information and better phone controls.

**Boundary:** Neither the screenshots nor the send counter establish physical panel refresh. See [validation](../VALIDATION.md) and [frame encoding](../../src/frame-codec.js).

## From unreadable status text to a phone HUD

**Observed:** Health and ammunition were difficult to read in the glasses view. The user allowed either a clearer glasses HUD or moving the information to the phone.

**Changed:** Version 0.1.3 added a phone HUD with actual health, armor, current weapon, ammunition and keys. The glasses view retained the original status bar. This made status readable without another display protocol or extra HUD messages to the glasses.

**Rationale reconstructed from implementation:** The phone already has the game state and a larger touch screen. The code uses that state directly rather than recognizing text from images. This is a code-supported explanation, not a claim that a separate glasses overlay prototype was tested.

**Boundary:** A phone HUD may require the player to glance at the phone. The record contains no eye-tracking or controlled usability study. See [HUD code](../../src/hud.js) and [HUD tests](../../tests/hud.test.mjs).

## From modifier chords to switches, then a fire-button correction

**User decision:** The user rejected interactions that require holding one button while pressing another and requested switches for those cases.

**Changed:** Version 0.1.4 made strafe and run persistent switches. It also made fire persistent, which extended the request too far.

**Observed correction:** The user rejected persistent fire because it keeps spending ammunition.

**Accepted result:** Version 0.1.5 keeps strafe and run as switches, but fires only while the fire button is pressed. Pause, disconnect, loss of focus and page hiding release inputs and clear switches. The user then accepted the game as meeting their release standard.

**Regression evidence:** [controller tests](../../tests/controller.test.mjs) cover fire release on pointer release, cancellation, capture loss and blur; the [browser test](../../tests/browser-smoke.mjs) checks actual ammunition use and stopping after release. The lesson is specific: a mode switch and a consumptive action have different persistence needs.

## From a package file to a usable install QR code

**Observed:** Installation repeatedly stalled at local-network connection. The user confirmed a shared subnet and noted a complex proxy setup. Installation later succeeded after a retry; later codes also failed. A code or file existing on the computer did not establish phone reachability.

**Changed during delivery:** The workflow checked the actual Wi-Fi address, incoming requests, complete download bytes and archive SHA-256. A separate service could serve the verified Studio export when the selected address or port was unsuitable.

**User decision:** Every application update must directly include the current install QR code; a phone package alone is insufficient.

**Boundary:** No live addresses or install QR codes are published here. Exact installation behavior and the old review-v3 checker limitation belong in [installation guidance](../INSTALL.md), not a claim that every checker passed.

## From an SDK example to a public source repository

**Observed:** The accepted application lived inside an SDK tree. Build scripts assumed that layout. The public-source audit also found absolute build-machine paths in generated engine diagnostics.

**Changed:** Build and browser tooling now resolve an external SDK explicitly. Relative C compiler inputs remove local paths from generated diagnostics; two directory builds produced identical engine files under the same toolchain. The public tree retains the engine source, local upstream patch, data origins and license notices.

**Boundary:** The portable engine build passed local tests and browser regression; it did not receive a new physical-device test. Platform terms and future binary distribution remain separate from user acceptance of the game.

## Decision tree at the end of this record

```text
Accepted game behavior: 0.1.5
├── glasses updates: preserve the accepted Smooth mode baseline
├── status readability: phone HUD beside the glasses view
├── touch input: strafe/run switches; momentary fire
└── delivery: each application update includes a current install QR code

Public source preparation
├── application/source provenance: documented and locally checked
├── platform components: external until terms can be verified
└── hosted publication: separate from local repository preparation
```

This is a map of settled requirements, not a fabricated grilling session. Future decisions still open are the public binary distribution terms, a durable distribution channel, and physical-device verification of any newly built package. User-specific publication choices are resolved with the maintainer when that work is requested.
