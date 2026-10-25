import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function sdkRoot() {
  const value = process.env.MEMOMIND_SDK_ROOT;
  if (!value) throw new Error('Set MEMOMIND_SDK_ROOT to the external Plugin Open Platform root; see docs/BUILD.md');
  const root = resolve(value);
  if (!existsSync(resolve(root, 'PhoneSDK/tools/build-mmpkg.mjs'))) throw new Error('MEMOMIND_SDK_ROOT must contain PhoneSDK/tools/build-mmpkg.mjs');
  return root;
}
