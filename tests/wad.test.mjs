import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { DEFAULT_WAD, loadDefaultWad, readImportedWad, validateWad } from '../src/wad.js';

function syntheticWad() {
  const bytes = new Uint8Array(60);
  bytes.set([73, 87, 65, 68, 3, 0, 0, 0, 12, 0, 0, 0]);
  for (const [index, name] of ['PLAYPAL', 'COLORMAP', 'E1M1'].entries()) {
    bytes.set(new TextEncoder().encode(name), 12 + index * 16 + 8);
  }
  return bytes;
}

test('bundled official Freedoom stream restores the complete verified WAD', async () => {
  const wad = await loadDefaultWad();
  assert.equal(wad.bytes.length, DEFAULT_WAD.bytes);
  assert.equal(createHash('sha256').update(wad.bytes).digest('hex'), DEFAULT_WAD.sha256);
  assert.equal(wad.name, 'freedoom1.wad');
  assert.equal(wad.mission, 'doom');
});

test('WAD structural checks reject truncation, PWADs and missing game data', () => {
  const valid = syntheticWad();
  assert.equal(validateWad(valid).mission, 'doom');
  assert.throws(() => validateWad(valid.slice(0, -1)), /directory|truncated/);
  const pwad = valid.slice();
  pwad[0] = 80;
  assert.throws(() => validateWad(pwad), /IWAD/);
  assert.throws(() => validateWad(valid.slice(0, 44)), /directory/);
  assert.throws(() => validateWad(valid.slice(0, 12)), /directory/);
  assert.equal(validateWad(valid, 'other.wad').name, 'doom.wad');
});

test('imported WAD uses binary host streams and enforces their declared size', async () => {
  const source = syntheticWad();
  const gm = {
    files: {
      async openRead(fileId) {
        return {
          fileId, length: source.length,
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue(source.slice(0, 9));
              controller.enqueue(source.slice(9));
              controller.close();
            },
          }),
        };
      },
    },
  };
  const wad = await readImportedWad(gm, { fileId: 'local', name: 'DOOM1.WAD', size: source.length });
  assert.equal(wad.name, 'doom1.wad');
  assert.deepEqual(wad.bytes, source);
});
