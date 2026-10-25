import { inflate } from '../vendor/fflate.js';

export const MAX_IWAD_BYTES = 32 * 1024 * 1024;
export const DEFAULT_WAD = Object.freeze({
  name: 'freedoom1.wad',
  bytes: 23578720,
  sha256: 'bc5739e88b20788845ce82ac0041effdecb4583ddbcdb05b9f899363eaa69892',
});

export function validateWad(bytes, requestedName = 'game.wad') {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('WAD must be a Uint8Array');
  if (bytes.length < 12 || bytes.length > MAX_IWAD_BYTES) throw new Error('WAD size is invalid or exceeds 32 MiB');
  const ascii = (start, length) => {
    let text = '';
    for (let index = start; index < start + length; index += 1) text += String.fromCharCode(bytes[index]);
    return text;
  };
  if (ascii(0, 4) !== 'IWAD') throw new Error('An IWAD is required; a PWAD/mod is not a complete game');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  const directory = view.getUint32(8, true);
  if (count < 1 || count > 32768 || directory > bytes.length || count * 16 > bytes.length - directory) {
    throw new Error('WAD directory is truncated or invalid');
  }
  const names = new Set();
  for (let index = 0; index < count; index += 1) {
    const offset = directory + index * 16;
    const position = view.getUint32(offset, true);
    const length = view.getUint32(offset + 4, true);
    if (position > bytes.length || length > bytes.length - position) throw new Error('WAD lump is outside the file');
    names.add(ascii(offset + 8, 8).replace(/\0.*$/s, '').toUpperCase());
  }
  for (const required of ['PLAYPAL', 'COLORMAP']) {
    if (!names.has(required)) throw new Error(`WAD is missing the required ${required} lump`);
  }
  const mission = names.has('MAP01') ? 'doom2' : names.has('E1M1') ? 'doom' : null;
  if (!mission) throw new Error('No supported DOOM first level was found');
  const basename = requestedName.split(/[\\/]/).pop().toLowerCase();
  const supported = new Set(['freedoom1.wad', 'freedoom2.wad', 'doom1.wad', 'doom.wad', 'doom2.wad', 'tnt.wad', 'plutonia.wad']);
  return {
    name: supported.has(basename) ? basename : mission === 'doom2' ? 'doom2.wad' : 'doom.wad',
    label: requestedName,
    mission,
    bytes,
  };
}

export async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'function') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // Older WebViews expose DecompressionStream without deflate-raw support.
    }
  }
  return inflate(bytes);
}

async function readLocal(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Game data could not be loaded (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadDefaultWad() {
  const url = new URL('../assets/freedoom1.wad.deflate', import.meta.url);
  let compressed;
  if (url.protocol === 'file:' && typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    compressed = new Uint8Array(await readFile(url));
  } else {
    compressed = await readLocal(url);
  }
  const bytes = await inflateRaw(compressed);
  if (bytes.length !== DEFAULT_WAD.bytes) throw new Error('Bundled Freedoom WAD has an unexpected size');
  return validateWad(bytes, DEFAULT_WAD.name);
}

export async function readImportedWad(gm, file, signal) {
  if (!file?.fileId || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_IWAD_BYTES) {
    throw new Error('Select a valid IWAD no larger than 32 MiB');
  }
  const opened = await gm.files.openRead(file.fileId, { signal });
  if (opened.fileId !== file.fileId || opened.length < 1 || opened.length > MAX_IWAD_BYTES ||
      !Number.isSafeInteger(opened.length) || !opened.stream?.getReader) {
    throw new Error('The host returned an invalid WAD stream');
  }
  const bytes = new Uint8Array(opened.length);
  const reader = opened.stream.getReader();
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || offset + value.length > bytes.length) {
        throw new Error('The WAD stream exceeds its declared size');
      }
      bytes.set(value, offset);
      offset += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== bytes.length) throw new Error('The WAD stream ended early');
  return validateWad(bytes, file.name || 'game.wad');
}
