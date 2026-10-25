import { createEngineHost } from './engine-core.js';
import { loadEngine } from './engine-loader.js';
import { loadDefaultWad, validateWad } from './wad.js';

export class EngineClient {
  constructor({ onFrame, onState, onStatus, onError, onBackend }) {
    this.callbacks = { onFrame, onState, onStatus, onError, onBackend };
    this.generation = 0;
    this.paused = false;
    this.ready = false;
  }

  async start(wad = { kind: 'default' }, { forceJavaScript = false } = {}) {
    this.dispose();
    const generation = ++this.generation;
    this.paused = false;
    if (typeof Worker === 'function') {
      try {
        await this.startWorker(wad, forceJavaScript, generation);
      } catch (error) {
        if (generation !== this.generation) return;
        this.worker?.terminate();
        this.worker = undefined;
        if (error.engineFailure) {
          this.ready = false;
          this.callbacks.onError(error);
          throw error;
        }
        await this.startMain(wad, forceJavaScript, generation, error);
      }
    } else {
      await this.startMain(wad, forceJavaScript, generation);
    }
  }

  startWorker(wad, forceJavaScript, generation) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./engine.worker.js', import.meta.url), {
        type: 'module', name: 'memomind-doom',
      });
      this.worker = worker;
      let ready = false;
      worker.onmessage = ({ data }) => {
        if (generation !== this.generation) return;
        if (data.type === 'frame') {
          this.callbacks.onFrame({
            indices: new Uint8Array(data.indices), palette: new Uint8Array(data.palette), serial: data.serial,
          });
        } else if (data.type === 'state') this.callbacks.onState(data);
        else if (data.type === 'status') this.callbacks.onStatus(data.phase);
        else if (data.type === 'backend') this.callbacks.onBackend(data.backend);
        else if (data.type === 'ready') {
          ready = true;
          this.ready = true;
          resolve();
        } else if (data.type === 'error') {
          const error = new Error(data.message);
          error.engineFailure = true;
          if (ready) {
            this.ready = false;
            this.callbacks.onError(error);
          } else reject(error);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        const error = new Error(event.message || 'DOOM worker failed');
        if (ready) {
          this.ready = false;
          this.callbacks.onError(error);
        } else reject(error);
      };
      const message = { type: 'start', forceJavaScript };
      if (wad.kind === 'default') message.wad = wad;
      else {
        const bytes = wad.bytes;
        message.wad = {
          kind: 'imported', name: wad.name,
          buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        };
      }
      worker.postMessage(message, wad.kind === 'default' ? [] : [message.wad.buffer]);
    });
  }

  async startMain(wad, forceJavaScript, generation, workerError) {
    this.callbacks.onStatus(workerError ? 'Using the main-thread compatibility runtime' : 'Loading complete game data');
    if (workerError) console.warn(workerError);
    const selected = wad.kind === 'default'
      ? await loadDefaultWad()
      : validateWad(wad.bytes, wad.name);
    const { module, backend } = await loadEngine({
      forceJavaScript, onLog: (message) => console.info(`[DOOM] ${message}`),
    });
    if (generation !== this.generation) return;
    this.callbacks.onBackend(backend);
    this.host = createEngineHost(module, {
      onFrame: (frame) => generation === this.generation && this.callbacks.onFrame(frame),
      onState: (state) => generation === this.generation && this.callbacks.onState(state),
      onError: (error) => {
        if (generation !== this.generation) return;
        this.ready = false;
        this.callbacks.onError(error);
      },
    });
    this.host.start(selected);
    if (this.paused) this.host.pause();
    this.ready = true;
  }

  press(key, pressed) {
    if (this.host) this.host.press(key, pressed);
    else this.worker?.postMessage({ type: 'key', key, pressed });
  }

  releaseAll() {
    if (this.host) this.host.releaseAll();
    else this.worker?.postMessage({ type: 'release' });
  }

  pause() {
    this.paused = true;
    if (this.host) this.host.pause();
    else this.worker?.postMessage({ type: 'pause' });
  }

  resume() {
    this.paused = false;
    if (this.host) this.host.resume();
    else this.worker?.postMessage({ type: 'resume' });
  }

  dispose() {
    this.generation += 1;
    this.ready = false;
    this.worker?.terminate();
    this.worker = undefined;
    this.host?.dispose();
    this.host = undefined;
  }
}
