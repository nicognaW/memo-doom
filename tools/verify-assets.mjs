import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
const base = new URL('../assets/', import.meta.url);
const meta = JSON.parse(readFileSync(new URL('freedoom.json', base), 'utf8'));
const packed = readFileSync(new URL('freedoom1.wad.deflate', base));
const wad = inflateRawSync(packed);
for (const [bytes, length, hash] of [[packed, meta.compressedBytes, meta.compressedSha256], [wad, meta.wadBytes, meta.wadSha256]]) {
  assert.equal(bytes.length, length);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
}
console.log('Freedoom compressed stream and WAD hashes verified');
