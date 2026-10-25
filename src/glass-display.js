import { frameTiles } from './frame-codec.js';
import { bytesToBase64, compressLz4 } from './lz4.js';

const RETRY_DELAYS = [200, 400, 800, 1500];
const LZ4_UNAVAILABLE = new Set(['METHOD_NOT_FOUND', 'CAPABILITY_UNAVAILABLE']);

function errorCode(error) {
  return String(error?.code ?? '').toUpperCase();
}

function isTransient(error) {
  const code = errorCode(error);
  if (['TIMEOUT', 'DEVICE_NOT_READY', 'NOT_READY', 'PLUGIN_NOT_READY', 'BUSY'].includes(code)) {
    return true;
  }
  const message = String(error?.message ?? error ?? '');
  return /not ready|runtime generation|timed?\s*out|timeout|temporarily unavailable/i.test(message);
}

function isDisconnected(error) {
  return errorCode(error) === 'DEVICE_DISCONNECTED' || /device\s+(?:is\s+)?disconnected/i.test(String(error?.message ?? ''));
}

export class GlassDisplay {
  constructor({ gm, onStatus = () => {}, onError = () => {}, now = () => performance.now() }) {
    if (!gm?.display || !gm?.device) throw new TypeError('gm.display and gm.device are required');
    this.gm = gm;
    this.onStatus = onStatus;
    this.onError = onError;
    this.now = now;
    this.measurementStarted = now();
    this.completions = [];
    this.sendStartedAt = null;
    this.latest = null;
    this.revision = 0;
    this.presentedRevision = 0;
    this.failedRevision = 0;
    this.activeRevision = 0;
    this.epoch = 0;
    this.started = false;
    this.stopped = false;
    this.connected = false;
    this.paused = false;
    this.running = false;
    this.needsCreate = true;
    this.needsFull = true;
    this.lz4Available = true;
    this.mode = null;
    this.nextFrameId = 1;
    this.offConnection = null;
    this.subscriptionId = null;
    this.idlePromise = null;
    this.resolveIdle = null;
    this.retryTimers = new Set();
    this.stats = {
      attempted: 0,
      presented: 0,
      dropped: 0,
      bytesSent: 0,
      lastBytes: 0,
      retries: 0,
      errors: 0,
      lastPrepareMs: 0,
      lastSendMs: 0,
    };
  }

  async start() {
    if (this.started || this.stopped) return;
    this.started = true;
    this.connected = true;
    this.invalidate();
    this.kick();
    try {
      this.offConnection = this.gm.device.onConnection((event) => {
        this.setConnected(event?.connected === true);
      });
    } catch (error) {
      this.reportError(error);
    }
    try {
      const result = await this.gm.device.subscribeEvents(['connection']);
      if (this.stopped) {
        if (result?.subscriptionId) {
          await this.gm.device.unsubscribeEvents(result.subscriptionId).catch((error) => this.reportError(error));
        }
        return;
      }
      this.subscriptionId = result?.subscriptionId ?? null;
    } catch (error) {
      if (!this.stopped) this.reportError(error);
    }
  }

  present(frame) {
    if (this.stopped) return;
    if (!frame || !(frame.gray4 instanceof Uint8Array)) throw new TypeError('frame must contain gray4 bytes');
    if (this.latest && this.revision !== this.activeRevision && this.revision !== this.presentedRevision) {
      this.stats.dropped += 1;
    }
    this.latest = frame;
    this.revision += 1;
    this.failedRevision = 0;
    this.kick();
  }

  setConnected(connected) {
    if (this.stopped) return;
    const next = connected === true;
    if (this.connected === next && this.started && next && !this.needsCreate) return;
    this.connected = next;
    this.needsCreate = true;
    this.needsFull = true;
    this.failedRevision = 0;
    this.invalidate();
    this.notifyStatus();
    this.kick();
  }

  pause() {
    if (this.stopped || this.paused) return;
    this.paused = true;
    this.invalidate();
    this.notifyStatus();
  }

  resume() {
    if (this.stopped) return;
    this.paused = false;
    this.needsFull = true;
    this.failedRevision = 0;
    this.invalidate();
    this.notifyStatus();
    this.kick();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.connected = false;
    this.latest = null;
    this.invalidate();
    const off = this.offConnection;
    this.offConnection = null;
    if (off) {
      try {
        off();
      } catch (error) {
        this.reportError(error);
      }
    }
    const subscriptionId = this.subscriptionId;
    this.subscriptionId = null;
    if (subscriptionId) {
      Promise.resolve(this.gm.device.unsubscribeEvents(subscriptionId))
        .catch((error) => this.reportError(error));
    }
    this.notifyStatus();
  }

  async idle() {
    while (this.running) {
      const pending = this.idlePromise;
      if (pending) await pending;
    }
  }

  getStats() {
    const now = this.now();
    this.completions = this.completions.filter((sample) => now - sample.at < 3000);
    const seconds = Math.max(0.001, Math.min(3000, now - this.measurementStarted) / 1000);
    return {
      ...this.stats,
      recentFps: this.completions.length / seconds,
      recentBytesPerSecond: this.completions.reduce((total, sample) => total + sample.bytes, 0) / seconds,
      inFlightMs: this.sendStartedAt === null ? 0 : Math.max(0, now - this.sendStartedAt),
      mode: this.mode,
      connected: this.connected,
      paused: this.paused,
      stopped: this.stopped,
      inFlight: this.running,
      pending: Boolean(this.latest) && this.presentedRevision !== this.revision,
      revision: this.revision,
      presentedRevision: this.presentedRevision,
      lz4Available: this.lz4Available,
    };
  }

  invalidate() {
    this.epoch += 1;
    for (const retry of this.retryTimers) {
      clearTimeout(retry.timer);
      retry.resolve();
    }
    this.retryTimers.clear();
  }

  reportError(error) {
    this.stats.errors += 1;
    const normalized = error instanceof Error ? error : new Error(String(error?.message ?? error ?? 'Unknown display error'));
    if (error?.code && !normalized.code) normalized.code = error.code;
    try {
      this.onError(normalized);
    } catch {}
  }

  notifyStatus() {
    try {
      this.onStatus(this.getStats());
    } catch {}
  }

  canSend() {
    return this.started
      && !this.stopped
      && this.connected
      && !this.paused
      && Boolean(this.latest)
      && this.failedRevision !== this.revision
      && (this.needsFull || this.presentedRevision !== this.revision);
  }

  kick() {
    if (this.running || !this.canSend()) return;
    this.running = true;
    this.idlePromise = new Promise((resolve) => {
      this.resolveIdle = resolve;
    });
    Promise.resolve().then(() => this.run()).finally(() => {
      this.running = false;
      this.activeRevision = 0;
      const resolve = this.resolveIdle;
      this.resolveIdle = null;
      if (resolve) resolve();
      this.notifyStatus();
    });
  }

  async run() {
    while (this.canSend()) {
      const revision = this.revision;
      const epoch = this.epoch;
      const frame = this.latest;
      this.activeRevision = revision;
      if (this.mode !== frame.mode) this.needsCreate = true;
      const outcome = await this.sendWithRetry(frame, revision, epoch);
      this.activeRevision = 0;
      if (outcome.status === 'stale') continue;
      if (this.stopped || epoch !== this.epoch) continue;
      if (outcome.status === 'failed') {
        if (revision !== this.revision) continue;
        this.failedRevision = revision;
        this.needsCreate = true;
        break;
      }
      this.presentedRevision = revision;
      this.needsFull = false;
      this.mode = frame.mode;
      this.stats.presented += 1;
      this.stats.bytesSent += outcome.bytes;
      this.stats.lastBytes = outcome.bytes;
      this.completions.push({ at: this.now(), bytes: outcome.bytes });
      this.notifyStatus();
    }
  }

  prepare(frame) {
    return frameTiles(frame).map((tile) => ({
      ...tile,
      compressed: compressLz4(tile.data),
      compressedBase64: null,
      rawBase64: null,
    }));
  }

  async sendWithRetry(frame, revision, epoch) {
    let tiles;
    try {
      const prepareStarted = this.now();
      tiles = this.prepare(frame);
      this.stats.lastPrepareMs = this.now() - prepareStarted;
    } catch (error) {
      this.reportError(error);
      return { status: 'failed' };
    }
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
      if (this.stopped || epoch !== this.epoch) return { status: 'stale' };
      if (revision !== this.revision) return { status: 'stale' };
      this.stats.attempted += 1;
      try {
        this.sendStartedAt = this.now();
        let bytes;
        try {
          bytes = await this.sendAttempt(frame, tiles, epoch);
        } finally {
          this.stats.lastSendMs = this.now() - this.sendStartedAt;
          this.sendStartedAt = null;
        }
        if (bytes === null) return { status: 'stale' };
        return { status: 'sent', bytes };
      } catch (error) {
        if (this.stopped || epoch !== this.epoch || revision !== this.revision) return { status: 'stale' };
        this.reportError(error);
        if (isDisconnected(error)) {
          this.setConnected(false);
          return { status: 'stale' };
        }
        if (!isTransient(error) || attempt === RETRY_DELAYS.length) return { status: 'failed' };
        this.stats.retries += 1;
        await this.delay(RETRY_DELAYS[attempt]);
      }
    }
    return { status: 'failed' };
  }

  delay(milliseconds) {
    return new Promise((resolve) => {
      const retry = { timer: null, resolve };
      retry.timer = setTimeout(() => {
        this.retryTimers.delete(retry);
        resolve();
      }, milliseconds);
      this.retryTimers.add(retry);
    });
  }

  current(epoch) {
    return !this.stopped && epoch === this.epoch;
  }

  async sendAttempt(frame, tiles, epoch) {
    if (this.needsCreate) {
      await this.gm.display.createPage();
      if (!this.current(epoch)) return null;
      this.needsCreate = false;
    }
    if (frame.mode === 'native') return this.sendNative(tiles[0], epoch);
    return this.sendFull(tiles, epoch);
  }

  geometry(tile) {
    return { x: tile.x, y: tile.y, width: tile.width, height: tile.height, stride: tile.stride };
  }

  compressedBase64(tile) {
    if (tile.compressedBase64 === null) tile.compressedBase64 = bytesToBase64(tile.compressed);
    return tile.compressedBase64;
  }

  rawBase64(tile) {
    if (tile.rawBase64 === null) tile.rawBase64 = bytesToBase64(tile.data);
    return tile.rawBase64;
  }

  async sendNative(tile, epoch) {
    if (this.lz4Available) {
      try {
        await this.gm.display.updateImageLz4({
          ...this.geometry(tile),
          decodedSize: tile.data.length,
          dataBase64: this.compressedBase64(tile),
        });
        return this.current(epoch) ? tile.compressed.length : null;
      } catch (error) {
        if (!LZ4_UNAVAILABLE.has(errorCode(error))) throw error;
        this.lz4Available = false;
        this.reportError(error);
      }
    }
    if (!this.current(epoch)) return null;
    await this.gm.display.updateImage({
      ...this.geometry(tile),
      dataBase64: this.rawBase64(tile),
    });
    return this.current(epoch) ? tile.data.length : null;
  }

  async sendFull(tiles, epoch) {
    if (this.lz4Available) {
      const frameId = this.nextFrameId;
      this.nextFrameId = this.nextFrameId >= 0xffffffff ? 1 : this.nextFrameId + 1;
      try {
        await this.gm.display.beginFrame({ frameId, tileCount: tiles.length });
        if (!this.current(epoch)) return null;
        for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
          const tile = tiles[tileIndex];
          await this.gm.display.updateFrameImageLz4({
            frameId,
            tileIndex,
            ...this.geometry(tile),
            decodedSize: tile.data.length,
            dataBase64: this.compressedBase64(tile),
          });
          if (!this.current(epoch)) return null;
        }
        return tiles.reduce((total, tile) => total + tile.compressed.length, 0);
      } catch (error) {
        if (!LZ4_UNAVAILABLE.has(errorCode(error))) throw error;
        this.lz4Available = false;
        this.reportError(error);
      }
    }
    if (!this.current(epoch)) return null;
    for (const tile of tiles) {
      await this.gm.display.updateImage({
        ...this.geometry(tile),
        dataBase64: this.rawBase64(tile),
      });
      if (!this.current(epoch)) return null;
    }
    return tiles.reduce((total, tile) => total + tile.data.length, 0);
  }
}
