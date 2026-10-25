import { createEngineHost } from './engine-core.js';
import { loadEngine } from './engine-loader.js';
import { loadDefaultWad, validateWad } from './wad.js';

let host;
let starting = false;
let paused = false;
let stopped = false;

function sendState(state) {
  self.postMessage(state);
}

function reportError(error) {
  self.postMessage({ type: 'error', message: error.message ?? String(error) });
}

self.onmessage = async ({ data }) => {
  if (stopped) return;
  if (data.type === 'stop') {
    stopped = true;
    host?.dispose();
    return;
  }
  if (data.type === 'pause') {
    paused = true;
    host?.pause();
    return;
  }
  if (data.type === 'resume') {
    paused = false;
    host?.resume();
    return;
  }
  if (!host) return;
  if (data.type === 'key') host.press(data.key, data.pressed);
  if (data.type === 'release') host.releaseAll();
};

self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type !== 'start' || starting || stopped) return;
  starting = true;
  try {
    self.postMessage({ type: 'status', phase: 'Loading complete game data' });
    const wad = data.wad.kind === 'default'
      ? await loadDefaultWad()
      : validateWad(new Uint8Array(data.wad.buffer), data.wad.name);
    if (stopped) return;
    self.postMessage({ type: 'status', phase: 'Compiling the DOOM engine' });
    const { module, backend } = await loadEngine({
      forceJavaScript: data.forceJavaScript,
      onLog: (message) => self.postMessage({ type: 'log', message }),
    });
    self.postMessage({ type: 'backend', backend });
    host = createEngineHost(module, {
      onFrame(frame) {
        self.postMessage(
          { type: 'frame', indices: frame.indices.buffer, palette: frame.palette.buffer, serial: frame.serial },
          [frame.indices.buffer, frame.palette.buffer],
        );
      },
      onState: sendState,
      onError: reportError,
      onLog(message) { self.postMessage({ type: 'log', message }); },
    });
    host.start(wad);
    if (paused) host.pause();
    self.postMessage({ type: 'ready', backend });
  } catch (error) {
    host?.dispose();
    reportError(error);
  }
});
