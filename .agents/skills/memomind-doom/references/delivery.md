# Installation delivery

Use [INSTALL.md](../../../../docs/INSTALL.md) as the installation and QR contract, [BUILD.md](../../../../docs/BUILD.md) for commands, and [SOURCES.md](../../../../docs/SOURCES.md) for distribution boundaries. This branch covers local developer installation; public hosting or a GitHub Release requires authorization for that destination.

## Prepare the actual artifacts

1. Read the current `manifest.json`, run the build and phone-package scripts, and record the output file's identity, version, size, and SHA-256. A phone package alone does not provide the glasses companion.
2. Obtain the compatible GM Web Bridge from the external SDK. Check that it provides every protocol required by the current manifest, keeping its manifest and review attachments with the original glasses package.
3. Use the platform's documented Studio import/export flow to produce the paired installation package. Inspect its actual phone manifest, glasses manifest, and review contents. Match the bytes and hashes of both components to the intended inputs. Import/export dropdown selections are not evidence of bundle contents.
4. Use a verifier that understands the exported review version. If it does not, preserve the tool failure and document the separate ZIP/hash/metadata checks used; do not edit the bundle to make an old verifier pass.

**Done:** an actual paired installation package exists, its components and review hashes are checked, and the output paths and verification method are recorded. A built MMPKG is only completion of the phone-package step.

## Make and verify the install QR code

1. Start the documented installation service for that exact bundle. Use a reachable Wi-Fi interface; determine it from the current environment rather than copying an old address. Keep temporary installation details outside tracked source.
2. Verify that a complete served download has the same byte count and SHA-256 as the intended bundle. Encode the actual service address with the platform's expected QR format. A QR generated from an assumed address is not a verified installation path.
3. Present the current version's QR directly with the update, plus the version and installation prerequisites. Keep the service running while the user installs. If the service or address changes, regenerate the QR and check it again.
4. If Studio needs account authentication, let the user complete authentication through the platform's supported UI and continue after it is complete. If a prerequisite blocks installation, report the exact missing step and preserve the built artifacts; do not describe the update as installed or complete.

**Done:** the delivered QR points to the running service for the checked bundle. Only a successful scan/install on the phone establishes installation success.

## Confirm play and close

On the phone and physical glasses, enter a real level and check the changed behavior plus movement, press/release fire, mode switches, HUD, pause, and disconnect recovery as applicable. Record who observed it and what they observed. Diagnostics count completed display requests; they do not measure the physical panel's refresh rate.

**Done:** distinguish artifact verification, network download, phone installation, and physical play results. Every application update includes its current usable install QR code even when the standalone package is also supplied.
