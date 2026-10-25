# Troubleshooting

Read the error and the owning script before changing dependencies. Keep logs in `.artifacts/` or another private working directory. Request only facts that cannot be obtained from the environment.

| Symptom | Check next | Exit criterion |
| --- | --- | --- |
| Missing SDK or missing ESM import | `MEMOMIND_SDK_ROOT`, the required external SDK tools, and the build path in [BUILD.md](../../../../docs/BUILD.md). Build `dist/` before previewing; the root HTML has no vendored platform runtime. | The existing build succeeds and Browser Studio opens the built application. |
| Python UTF-8 decoding failure on Windows | The failing script's encoding and the active Python UTF-8 mode. Prefer explicit UTF-8 for file operations; use `PYTHONUTF8=1` for tooling that follows the process default. | The same operation reads the relevant non-ASCII file correctly. |
| Engine cannot build | Activated Emscripten, compiler version, `EMSDK` / `EMCC_PY`, Python command, and custom `EM_CONFIG`. | Both existing backend builds succeed; real-engine tests establish runtime behavior. |
| Browser test cannot launch | Installed Playwright browser or `CHROMIUM_EXECUTABLE`, then the existing test's server log and port. | The browser opens the real plugin and the failing interaction can be observed. |
| QR stalls at LAN resolution or connection | Actual service, current Wi-Fi address, VPN/TUN routing, firewall, received connections, and a complete download. Same-subnet membership alone is insufficient. Follow [INSTALL.md](../../../../docs/INSTALL.md). | The phone completes installation; a desktop-only download is reported separately. |
| Glasses show nothing | Required permission, connection state, compatible companion and its protocols, then actual sent frame/ACK diagnostics. | The physical glasses show a frame, or the report narrows the missing stage without claiming visual success. |
| High dropped-frame count | Current completed sends, queue behavior, retry/errors, and whether the counter measures replaced pending frames. Read [ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md). | The report distinguishes stale-frame replacement from transport failures and avoids inferring panel refresh rate. |
| SDK-wide suite fails | Compare the failing test with the application scope and [VALIDATION.md](../../../../docs/VALIDATION.md). | The exact external failure remains visible; the application result is reported on its own evidence. |

For an unexplained failure, preserve the minimal reproduction, current backend and quality, relevant diagnostics, and the command or interaction that failed. Then change one suspected cause and rerun the smallest check that can distinguish it.
