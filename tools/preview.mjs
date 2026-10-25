import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sdkRoot } from './platform-sdk.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = sdkRoot();
const result = spawnSync(process.execPath, [resolve(sdk, 'PhoneSDK/tools/run-browser-studio.mjs'), '--plugin', resolve(root, 'dist'), ...process.argv.slice(2)], { cwd: resolve(sdk, 'PhoneSDK'), stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
