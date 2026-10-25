import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeDoomFrame, frameTiles, paletteLuma } from '../src/frame-codec.js';
import { bytesToBase64, compressLz4 } from '../src/lz4.js';

function decodeLz4(input, expectedSize) {
  const output = new Uint8Array(expectedSize);
  let source = 0;
  let target = 0;
  const readLength = (initial) => {
    let length = initial;
    if (initial === 15) {
      let value;
      do {
        assert.ok(source < input.length, 'truncated LZ4 length');
        value = input[source++];
        length += value;
      } while (value === 255);
    }
    return length;
  };
  while (source < input.length) {
    const token = input[source++];
    const literalLength = readLength(token >>> 4);
    assert.ok(source + literalLength <= input.length, 'truncated literals');
    assert.ok(target + literalLength <= output.length, 'literal overflow');
    output.set(input.subarray(source, source + literalLength), target);
    source += literalLength;
    target += literalLength;
    if (source === input.length) break;
    assert.ok(source + 2 <= input.length, 'truncated match offset');
    const offset = input[source] | (input[source + 1] << 8);
    source += 2;
    assert.ok(offset > 0 && offset <= target, 'invalid match offset');
    const matchLength = readLength(token & 15) + 4;
    assert.ok(target + matchLength <= output.length, 'match overflow');
    for (let index = 0; index < matchLength; index += 1) {
      output[target] = output[target - offset];
      target += 1;
    }
  }
  assert.equal(target, expectedSize, 'decoded size');
  return output;
}

function grayPalette() {
  const palette = new Uint8Array(768);
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = index;
    palette[index * 3 + 1] = index;
    palette[index * 3 + 2] = index;
  }
  return palette;
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

test('paletteLuma validates input and produces monotonic integer GRAY4', () => {
  assert.throws(() => paletteLuma(new Uint8Array(767)), RangeError);
  assert.throws(() => paletteLuma([]), TypeError);
  const palette = grayPalette();
  const gray = paletteLuma(palette);
  assert.equal(gray.length, 256);
  for (let index = 0; index < 256; index += 1) {
    assert.ok(gray[index] >= 0 && gray[index] <= 15);
    if (index) assert.ok(gray[index] >= gray[index - 1]);
    assert.equal(gray[index], Math.floor((index + 8) / 17));
  }
  palette.fill(0);
  palette[0] = palette[3] = palette[6] = 255;
  assert.equal(paletteLuma(palette)[0], 5);
});

test('native encoding preserves pixels and uses high/low nibbles for even/odd x', () => {
  const indices = Uint8Array.from({ length: 64000 }, (_, index) => index % 256);
  const gray = paletteLuma(grayPalette());
  const frame = encodeDoomFrame(indices, grayPalette());
  assert.deepEqual({ mode: frame.mode, width: frame.width, height: frame.height, stride: frame.stride }, {
    mode: 'native', width: 320, height: 200, stride: 160,
  });
  assert.equal(frame.gray4.length, 32000);
  for (let index = 0; index < indices.length; index += 1) {
    const packed = frame.gray4[index >>> 1];
    assert.equal(index % 2 === 0 ? packed >>> 4 : packed & 15, gray[indices[index]]);
  }
  assert.throws(() => encodeDoomFrame(new Uint8Array(63999), grayPalette()), RangeError);
  assert.throws(() => encodeDoomFrame([], grayPalette()), TypeError);
});

test('smooth preserves the native display rectangle with exact doubled sampled pixels', () => {
  const indices = Uint8Array.from({ length: 64000 }, (_, index) => (index * 13 + Math.floor(index / 320)) % 256);
  const palette = grayPalette();
  const gray = paletteLuma(palette);
  const frame = encodeDoomFrame(indices, palette, { smooth: true });
  assert.equal(frame.mode, 'native');
  assert.equal(frame.gray4.length, 32000);
  const tiles = frameTiles(frame);
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].x, 140);
  assert.equal(tiles[0].y, 75);
  for (let y = 0; y < 200; y += 1) {
    for (let x = 0; x < 320; x += 2) {
      const value = gray[indices[(y - y % 2) * 320 + x]];
      assert.equal(frame.gray4[y * 160 + x / 2], (value << 4) | value);
    }
  }
  assert.deepEqual(decodeLz4(compressLz4(tiles[0].data), 32000), tiles[0].data);
});

test('full encoding is exact nearest-neighbor 1.75x scaling', () => {
  const indices = Uint8Array.from({ length: 64000 }, (_, index) => (index * 37 + 11) & 255);
  const gray = paletteLuma(grayPalette());
  const frame = encodeDoomFrame(indices, grayPalette(), { fullScreen: true });
  assert.deepEqual({ mode: frame.mode, width: frame.width, height: frame.height, stride: frame.stride }, {
    mode: 'full', width: 560, height: 350, stride: 280,
  });
  assert.equal(frame.gray4.length, 98000);
  for (let y = 0; y < 350; y += 1) {
    for (let x = 0; x < 560; x += 1) {
      const source = indices[Math.floor(y * 4 / 7) * 320 + Math.floor(x * 4 / 7)];
      const packed = frame.gray4[y * 280 + (x >>> 1)];
      assert.equal(x % 2 === 0 ? packed >>> 4 : packed & 15, gray[source], `pixel ${x},${y}`);
    }
  }
});

test('frameTiles returns bounded native/full tiles with independent raw regions', () => {
  const indices = Uint8Array.from({ length: 64000 }, (_, index) => index & 255);
  const native = encodeDoomFrame(indices, grayPalette());
  const nativeTiles = frameTiles(native);
  assert.equal(nativeTiles.length, 1);
  assert.deepEqual({ x: nativeTiles[0].x, y: nativeTiles[0].y, width: nativeTiles[0].width, height: nativeTiles[0].height, stride: nativeTiles[0].stride }, {
    x: 140, y: 75, width: 320, height: 200, stride: 160,
  });
  assert.deepEqual(nativeTiles[0].data, native.gray4);
  assert.notEqual(nativeTiles[0].data, native.gray4);
  const full = encodeDoomFrame(indices, grayPalette(), { fullScreen: true });
  const tiles = frameTiles(full);
  assert.equal(tiles.length, 2);
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    assert.deepEqual({ x: tile.x, y: tile.y, width: tile.width, height: tile.height, stride: tile.stride }, {
      x: 20, y: index * 175, width: 560, height: 175, stride: 280,
    });
    assert.equal(tile.data.length, 49000);
    assert.ok(tile.data.length <= 81901);
    assert.deepEqual(tile.data, full.gray4.subarray(index * 49000, (index + 1) * 49000));
  }
  assert.throws(() => frameTiles({ ...native, gray4: new Uint8Array(31999) }), RangeError);
  assert.throws(() => frameTiles({ ...full, mode: 'other' }), RangeError);
});

test('raw LZ4 round-trips empty, repetitive, random, long-match, odd and boundary inputs', () => {
  let seed = 0x12345678;
  const random = Uint8Array.from({ length: 81901 }, () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed & 255;
  });
  const periodic = Uint8Array.from({ length: 50000 }, (_, index) => [0, 255, 1, 2, 3, 255][index % 6]);
  const cases = [
    new Uint8Array(),
    new Uint8Array([0]),
    new Uint8Array(100000),
    new Uint8Array(70001).fill(255),
    periodic,
    random,
    Uint8Array.from({ length: 33333 }, (_, index) => index % 7),
  ];
  for (const length of [1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 254, 255, 256, 270, 4097, 65535, 65536]) {
    cases.push(random.slice(0, length));
    cases.push(periodic.slice(0, length));
  }
  for (const input of cases) {
    const compressed = compressLz4(input);
    assert.deepEqual(decodeLz4(compressed, input.length), input, `input length ${input.length}`);
  }
  assert.throws(() => compressLz4([]), TypeError);
});

test('Base64 chunking preserves large binary payloads', () => {
  const bytes = Uint8Array.from({ length: 20000 }, (_, index) => (index * 19) & 255);
  assert.deepEqual(fromBase64(bytesToBase64(bytes)), bytes);
  assert.equal(bytesToBase64(new Uint8Array()), '');
});

test('real native and full frame tiles independently LZ4 round-trip', () => {
  const indices = Uint8Array.from({ length: 64000 }, (_, index) => (index * index + 9) & 255);
  for (const fullScreen of [false, true]) {
    const frame = encodeDoomFrame(indices, grayPalette(), { fullScreen });
    for (const tile of frameTiles(frame)) {
      const compressed = compressLz4(tile.data);
      assert.deepEqual(decodeLz4(compressed, tile.data.length), tile.data);
      assert.deepEqual(decodeLz4(fromBase64(bytesToBase64(compressed)), tile.data.length), tile.data);
    }
  }
});
