async function readBinary(url) {
  if (url.protocol === 'file:' && typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(url));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Engine download failed (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadEngine({ forceJavaScript = false, onLog = () => {} } = {}) {
  const backends = forceJavaScript ? ['js'] : ['wasm', 'js'];
  let previousError;
  for (const backend of backends) {
    try {
      const filename = backend === 'wasm' ? 'doom.js' : 'doom-js.js';
      const { default: createDoomEngine } = await import(new URL(`../engine/${filename}`, import.meta.url).href);
      const options = { print: onLog, printErr: onLog };
      if (backend === 'wasm') {
        options.wasmBinary = await readBinary(new URL('../engine/doom.wasm', import.meta.url));
      }
      const module = await createDoomEngine(options);
      if (!module.HEAPU8 || !module.FS || !module.callMain) throw new Error('Incomplete DOOM runtime');
      return { module, backend };
    } catch (error) {
      previousError = error;
      onLog(`${backend} backend unavailable: ${error.message ?? error}`);
    }
  }
  throw new Error(`DOOM could not start: ${previousError?.message ?? previousError}`);
}
