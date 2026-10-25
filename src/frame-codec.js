const NATIVE_WIDTH = 320;
const NATIVE_HEIGHT = 200;
const FULL_WIDTH = 560;
const FULL_HEIGHT = 350;
const MAX_TILE_BYTES = 81901;

function requireBytes(value, length, name) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${name} must be a Uint8Array`);
  if (value.length !== length) throw new RangeError(`${name} must contain exactly ${length} bytes`);
}

export function paletteLuma(palette) {
  requireBytes(palette, 768, 'palette');
  const gray = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) {
    const offset = index * 3;
    const luma = (77 * palette[offset] + 150 * palette[offset + 1] + 29 * palette[offset + 2] + 128) >>> 8;
    gray[index] = Math.min(15, Math.floor((luma + 8) / 17));
  }
  return gray;
}

function packNative(indices, gray) {
  const packed = new Uint8Array(32000);
  let output = 0;
  for (let index = 0; index < indices.length; index += 2) {
    packed[output] = (gray[indices[index]] << 4) | gray[indices[index + 1]];
    output += 1;
  }
  return packed;
}

function packSmooth(indices, gray) {
  const packed = new Uint8Array(32000);
  // Keep the same display rectangle; duplicate each sampled pixel into a 2x2 block.
  // Repeated adjacent rows compress well without a new glasses protocol or firmware.
  for (let y = 0; y < NATIVE_HEIGHT; y += 2) {
    const row = y * 160;
    for (let x = 0; x < NATIVE_WIDTH; x += 2) {
      const value = gray[indices[y * NATIVE_WIDTH + x]];
      const pair = (value << 4) | value;
      packed[row + x / 2] = pair;
      packed[row + 160 + x / 2] = pair;
    }
  }
  return packed;
}

function packFullScreen(indices, gray) {
  const packed = new Uint8Array(98000);
  for (let y = 0; y < FULL_HEIGHT; y += 1) {
    const sourceY = Math.floor(y * 4 / 7);
    let output = y * 280;
    for (let x = 0; x < FULL_WIDTH; x += 2) {
      const leftX = Math.floor(x * 4 / 7);
      const rightX = Math.floor((x + 1) * 4 / 7);
      packed[output] = (gray[indices[sourceY * NATIVE_WIDTH + leftX]] << 4)
        | gray[indices[sourceY * NATIVE_WIDTH + rightX]];
      output += 1;
    }
  }
  return packed;
}

export function encodeDoomFrame(indices, palette, { fullScreen = false, smooth = false } = {}) {
  requireBytes(indices, NATIVE_WIDTH * NATIVE_HEIGHT, 'indices');
  const gray = paletteLuma(palette);
  if (fullScreen) {
    return {
      mode: 'full',
      width: FULL_WIDTH,
      height: FULL_HEIGHT,
      stride: 280,
      gray4: packFullScreen(indices, gray),
    };
  }
  return {
    mode: 'native',
    width: NATIVE_WIDTH,
    height: NATIVE_HEIGHT,
    stride: 160,
    gray4: smooth ? packSmooth(indices, gray) : packNative(indices, gray),
  };
}

function extractTile(frame, x, y, width, height, sourceY = 0) {
  const data = new Uint8Array((width / 2) * height);
  const stride = width / 2;
  for (let row = 0; row < height; row += 1) {
    const start = (sourceY + row) * frame.stride;
    data.set(frame.gray4.subarray(start, start + stride), row * stride);
  }
  return { x, y, width, height, stride, data };
}

export function frameTiles(frame) {
  if (!frame || !(frame.gray4 instanceof Uint8Array)) {
    throw new TypeError('frame must contain a Uint8Array gray4 bitmap');
  }
  let tiles;
  if (frame.mode === 'native') {
    if (frame.width !== 320 || frame.height !== 200 || frame.stride !== 160) {
      throw new RangeError('native frame geometry must be 320x200 with stride 160');
    }
    requireBytes(frame.gray4, 32000, 'frame.gray4');
    tiles = [extractTile(frame, 140, 75, 320, 200)];
  } else if (frame.mode === 'full') {
    if (frame.width !== 560 || frame.height !== 350 || frame.stride !== 280) {
      throw new RangeError('full frame geometry must be 560x350 with stride 280');
    }
    requireBytes(frame.gray4, 98000, 'frame.gray4');
    tiles = [
      extractTile(frame, 20, 0, 560, 175),
      extractTile(frame, 20, 175, 560, 175, 175),
    ];
  } else {
    throw new RangeError('frame.mode must be native or full');
  }
  for (const tile of tiles) {
    if (tile.data.length > MAX_TILE_BYTES) throw new RangeError('tile exceeds the logical payload limit');
  }
  return tiles;
}
