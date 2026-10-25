import { cpSync, existsSync, mkdirSync, statSync, rmSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { sdkRoot } from './platform-sdk.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const required = [
  'assets/freedoom1.wad.deflate',
  'licenses/FREEDOOM-COPYING.txt',
  'licenses/FREEDOOM-CREDITS.txt',
  'engine/doom.js',
  'engine/doom.wasm',
  'engine/doom-js.js',
];
for (const path of required) {
  if (!existsSync(resolve(root, path))) {
    throw new Error(`Missing ${path}; run the asset and engine build commands first`);
  }
}
const sdk = sdkRoot();
const { bundlePhoneSdk } = await import(pathToFileURL(resolve(sdk, 'PhoneSDK/tools/bundle-phone-sdk.mjs')).href);
const sdkVersion = JSON.parse(readFileSync(resolve(sdk, 'PhoneSDK/packages/web-sdk/package.json'), 'utf8')).version;
const sdkBundle = await bundlePhoneSdk(resolve(sdk, 'PhoneSDK'), sdkVersion);
if (existsSync(dist) && lstatSync(dist).isSymbolicLink()) throw new Error('Refusing to replace a symlink at dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(resolve(dist, 'engine'), { recursive: true });
for (const path of ['index.html', 'style.css', 'manifest.json', 'README.md', 'src', 'vendor', 'licenses', 'assets']) {
  const source = resolve(root, path);
  if (!existsSync(source)) throw new Error(`Missing application input: ${path}`);
  cpSync(source, resolve(dist, path), { recursive: true });
}
for (const path of ['doom.js', 'doom.wasm', 'doom-js.js']) {
  cpSync(resolve(root, 'engine', path), resolve(dist, 'engine', path));
}
writeFileSync(resolve(dist, 'vendor/gm-plugin-web-sdk.esm.js'), sdkBundle);
const bytes = statSync(resolve(dist, 'assets/freedoom1.wad.deflate')).size;
if (bytes >= 10 * 1024 * 1024) throw new Error('The compressed game data exceeds the package limit');
console.log(`DOOM application ready: ${dist} (${bytes} compressed WAD bytes)`);
