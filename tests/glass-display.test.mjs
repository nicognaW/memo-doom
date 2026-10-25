import test from 'node:test';
import assert from 'node:assert/strict';
import { GlassDisplay } from '../src/glass-display.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeLz4(input, expectedSize) {
  const output = new Uint8Array(expectedSize);
  let source = 0;
  let target = 0;
  const readLength = (initial) => {
    let length = initial;
    if (initial === 15) {
      let value;
      do {
        assert.ok(source < input.length);
        value = input[source++];
        length += value;
      } while (value === 255);
    }
    return length;
  };
  while (source < input.length) {
    const token = input[source++];
    const literals = readLength(token >>> 4);
    output.set(input.subarray(source, source + literals), target);
    source += literals;
    target += literals;
    if (source === input.length) break;
    const offset = input[source] | (input[source + 1] << 8);
    source += 2;
    assert.ok(offset > 0 && offset <= target);
    const matches = readLength(token & 15) + 4;
    for (let index = 0; index < matches; index += 1) {
      output[target] = output[target - offset];
      target += 1;
    }
  }
  assert.equal(target, expectedSize);
  return output;
}

class FakeGM {
  constructor() {
    this.calls = [];
    this.handlers = {};
    this.connectionListener = null;
    this.offCalled = 0;
    this.device = {
      onConnection: (listener) => {
        this.connectionListener = listener;
        return () => {
          this.offCalled += 1;
          this.connectionListener = null;
        };
      },
      subscribeEvents: async (types) => {
        this.calls.push({ method: 'subscribeEvents', args: types });
        return { subscriptionId: 'connection-subscription' };
      },
      unsubscribeEvents: async (subscriptionId) => {
        this.calls.push({ method: 'unsubscribeEvents', args: subscriptionId });
      },
    };
    this.display = {};
    for (const method of ['createPage', 'updateImage', 'updateImageLz4', 'beginFrame', 'updateFrameImageLz4', 'closePage']) {
      this.display[method] = (args = {}) => {
        const call = { method, args };
        this.calls.push(call);
        return this.handlers[method] ? this.handlers[method](args, call) : Promise.resolve({});
      };
    }
  }

  displayCalls(method) {
    return this.calls.filter((call) => call.method === method);
  }

  emitConnection(connected) {
    this.connectionListener?.({ connected });
  }
}

function makeFrame(mode = 'native', value = 1) {
  const full = mode === 'full';
  return {
    mode,
    width: full ? 560 : 320,
    height: full ? 350 : 200,
    stride: full ? 280 : 160,
    gray4: new Uint8Array(full ? 98000 : 32000).fill(value),
  };
}

async function waitFor(predicate, message = 'condition') {
  for (let count = 0; count < 200; count += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail(`Timed out waiting for ${message}`);
}

function decodedCall(call) {
  if (call.method === 'updateImage') return fromBase64(call.args.dataBase64);
  return decodeLz4(fromBase64(call.args.dataBase64), call.args.decodedSize);
}

test('diagnostics separate compression and bridge time and expire idle throughput', async () => {
  let now = 0;
  const gm = new FakeGM();
  const pending = deferred();
  gm.handlers.updateImageLz4 = () => pending.promise;
  const display = new GlassDisplay({ gm, now: () => now });
  await display.start();
  display.present(makeFrame());
  await waitFor(() => gm.displayCalls('updateImageLz4').length === 1);
  now = 200;
  assert.equal(display.getStats().inFlightMs, 200);
  assert.equal(display.getStats().recentFps, 0);
  pending.resolve({});
  await display.idle();
  const stats = display.getStats();
  assert.equal(stats.lastSendMs, 200);
  assert.equal(stats.lastPrepareMs, 0);
  assert.equal(stats.recentFps, 5);
  assert.equal(stats.recentBytesPerSecond, stats.lastBytes * 5);
  assert.equal(stats.inFlightMs, 0);
  now = 3500;
  assert.equal(display.getStats().recentFps, 0);
  assert.equal(display.getStats().recentBytesPerSecond, 0);
  display.stop();
});

test('start subscribes without getInfo and present keeps one request in flight with latest-only replacement', async () => {
  const gm = new FakeGM();
  const first = deferred();
  let updateCount = 0;
  gm.handlers.updateImageLz4 = () => {
    updateCount += 1;
    return updateCount === 1 ? first.promise : Promise.resolve({});
  };
  const display = new GlassDisplay({ gm });
  await display.start();
  assert.deepEqual(gm.displayCalls('subscribeEvents')[0].args, ['connection']);
  display.present(makeFrame('native', 1));
  await waitFor(() => gm.displayCalls('updateImageLz4').length === 1, 'first update');
  display.present(makeFrame('native', 2));
  display.present(makeFrame('native', 3));
  assert.equal(gm.displayCalls('updateImageLz4').length, 1);
  first.resolve({});
  await display.idle();
  const updates = gm.displayCalls('updateImageLz4');
  assert.equal(updates.length, 2);
  assert.ok(decodedCall(updates[0]).every((value) => value === 1));
  assert.ok(decodedCall(updates[1]).every((value) => value === 3));
  assert.equal(display.getStats().dropped, 1);
  assert.equal(display.getStats().attempted, 2);
  assert.equal(display.getStats().presented, 2);
  assert.equal(display.getStats().mode, 'native');
  display.stop();
});

test('native uses one positioned LZ4 tile and full mode uses atomic two-tile geometry', async () => {
  const gm = new FakeGM();
  const display = new GlassDisplay({ gm });
  await display.start();
  display.present(makeFrame('native', 0xab));
  await display.idle();
  const native = gm.displayCalls('updateImageLz4')[0];
  assert.deepEqual(native.args, {
    x: 140, y: 75, width: 320, height: 200, stride: 160,
    decodedSize: 32000, dataBase64: native.args.dataBase64,
  });
  assert.equal(gm.displayCalls('beginFrame').length, 0);
  assert.ok(decodedCall(native).every((value) => value === 0xab));

  display.present(makeFrame('full', 0xcd));
  await display.idle();
  assert.equal(gm.displayCalls('createPage').length, 2, 'mode change recreates the page');
  const begin = gm.displayCalls('beginFrame')[0];
  assert.equal(begin.args.tileCount, 2);
  const tiles = gm.displayCalls('updateFrameImageLz4');
  assert.equal(tiles.length, 2);
  for (let index = 0; index < 2; index += 1) {
    const call = tiles[index];
    assert.equal(call.args.frameId, begin.args.frameId);
    assert.equal(call.args.tileIndex, index);
    assert.deepEqual({ x: call.args.x, y: call.args.y, width: call.args.width, height: call.args.height, stride: call.args.stride }, {
      x: 20, y: index * 175, width: 560, height: 175, stride: 280,
    });
    assert.equal(call.args.decodedSize, 49000);
    assert.ok(decodedCall(call).every((value) => value === 0xcd));
  }
  display.present(makeFrame('full', 0xef));
  await display.idle();
  assert.notEqual(gm.displayCalls('beginFrame')[1].args.frameId, begin.args.frameId);
  assert.equal(display.getStats().mode, 'full');
  display.stop();
});

test('native LZ4 capability failure reports once and falls back to one raw request thereafter', async () => {
  const gm = new FakeGM();
  const errors = [];
  gm.handlers.updateImageLz4 = async () => {
    const error = new Error('LZ4 missing');
    error.code = 'METHOD_NOT_FOUND';
    throw error;
  };
  const display = new GlassDisplay({ gm, onError: (error) => errors.push(error) });
  await display.start();
  display.present(makeFrame('native', 7));
  await display.idle();
  display.present(makeFrame('native', 8));
  await display.idle();
  assert.equal(gm.displayCalls('updateImageLz4').length, 1);
  const raw = gm.displayCalls('updateImage');
  assert.equal(raw.length, 2);
  assert.equal(raw[0].args.decodedSize, undefined);
  assert.equal(decodedCall(raw[0]).length, 32000);
  assert.ok(decodedCall(raw[0]).every((value) => value === 7));
  assert.ok(decodedCall(raw[1]).every((value) => value === 8));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'METHOD_NOT_FOUND');
  assert.equal(display.getStats().lz4Available, false);
  display.stop();
});

test('full LZ4 capability failure falls back to two raw tiles, never one 98000-byte request', async () => {
  const gm = new FakeGM();
  const errors = [];
  gm.handlers.updateFrameImageLz4 = async () => {
    const error = new Error('atomic LZ4 unavailable');
    error.code = 'CAPABILITY_UNAVAILABLE';
    throw error;
  };
  const display = new GlassDisplay({ gm, onError: (error) => errors.push(error) });
  await display.start();
  display.present(makeFrame('full', 9));
  await display.idle();
  assert.equal(gm.displayCalls('beginFrame').length, 1);
  const raw = gm.displayCalls('updateImage');
  assert.equal(raw.length, 2);
  for (let index = 0; index < 2; index += 1) {
    assert.equal(raw[index].args.y, index * 175);
    assert.equal(raw[index].args.decodedSize, undefined);
    assert.equal(decodedCall(raw[index]).length, 49000);
    assert.ok(decodedCall(raw[index]).every((value) => value === 9));
  }
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'CAPABILITY_UNAVAILABLE');
  display.stop();
});

test('TIMEOUT retries the same latest bytes with finite backoff', async () => {
  const gm = new FakeGM();
  let calls = 0;
  gm.handlers.updateImageLz4 = async () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('device plugin is not ready for this runtime generation');
      error.code = 'TIMEOUT';
      throw error;
    }
    return {};
  };
  const display = new GlassDisplay({ gm });
  await display.start();
  display.present(makeFrame('native', 0x42));
  await display.idle();
  const updates = gm.displayCalls('updateImageLz4');
  assert.equal(updates.length, 2);
  assert.equal(updates[0].args.dataBase64, updates[1].args.dataBase64);
  assert.equal(display.getStats().attempted, 2);
  assert.equal(display.getStats().presented, 1);
  assert.equal(display.getStats().retries, 1);
  display.stop();
});

test('permission failure does not retry forever and a new frame can recover', async () => {
  const gm = new FakeGM();
  const errors = [];
  let deny = true;
  gm.handlers.updateImageLz4 = async () => {
    if (deny) {
      const error = new Error('display permission denied');
      error.code = 'PERMISSION_DENIED';
      throw error;
    }
    return {};
  };
  const display = new GlassDisplay({ gm, onError: (error) => errors.push(error) });
  await display.start();
  display.present(makeFrame());
  await display.idle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(gm.displayCalls('updateImageLz4').length, 1);
  assert.equal(errors.length, 1);
  deny = false;
  display.present(makeFrame('native', 2));
  await display.idle();
  assert.equal(gm.displayCalls('updateImageLz4').length, 2);
  assert.equal(display.getStats().presented, 1);
  display.stop();
});

test('connection events, pause/resume and reconnection retain only the latest complete frame', async () => {
  const gm = new FakeGM();
  const display = new GlassDisplay({ gm });
  await display.start();
  display.present(makeFrame('native', 1));
  await display.idle();
  display.pause();
  display.present(makeFrame('native', 2));
  await display.idle();
  assert.equal(gm.displayCalls('updateImageLz4').length, 1);
  display.resume();
  await display.idle();
  assert.equal(gm.displayCalls('updateImageLz4').length, 2);
  assert.ok(decodedCall(gm.displayCalls('updateImageLz4')[1]).every((value) => value === 2));

  gm.emitConnection(false);
  display.present(makeFrame('native', 3));
  await display.idle();
  assert.equal(gm.displayCalls('updateImageLz4').length, 2);
  const creates = gm.displayCalls('createPage').length;
  gm.emitConnection(true);
  await display.idle();
  assert.equal(gm.displayCalls('createPage').length, creates + 1);
  assert.equal(gm.displayCalls('updateImageLz4').length, 3);
  assert.ok(decodedCall(gm.displayCalls('updateImageLz4')[2]).every((value) => value === 3));
  display.stop();
});

test('stop during a pending tile is idempotent, unsubscribes and never resumes with an old completion', async () => {
  const gm = new FakeGM();
  const pending = deferred();
  gm.handlers.updateImageLz4 = () => pending.promise;
  const display = new GlassDisplay({ gm });
  await display.start();
  display.present(makeFrame());
  await waitFor(() => gm.displayCalls('updateImageLz4').length === 1, 'pending tile');
  display.stop();
  display.stop();
  display.present(makeFrame('native', 2));
  pending.resolve({});
  await display.idle();
  await Promise.resolve();
  assert.equal(gm.displayCalls('updateImageLz4').length, 1);
  assert.equal(gm.offCalled, 1);
  assert.equal(gm.displayCalls('unsubscribeEvents').length, 1);
  assert.equal(display.getStats().stopped, true);
});

test('stop during createPage prevents any subsequent image request', async () => {
  const gm = new FakeGM();
  const pending = deferred();
  gm.handlers.createPage = () => pending.promise;
  const display = new GlassDisplay({ gm });
  await display.start();
  display.present(makeFrame());
  await waitFor(() => gm.displayCalls('createPage').length === 1, 'pending createPage');
  display.stop();
  pending.resolve({});
  await display.idle();
  assert.equal(gm.displayCalls('updateImageLz4').length, 0);
  assert.equal(gm.displayCalls('updateImage').length, 0);
});

test('a stale request rejected during lifecycle suspension is not a fatal error', async () => {
  const gm = new FakeGM();
  const pending = deferred();
  const errors = [];
  gm.handlers.updateImageLz4 = () => pending.promise;
  const display = new GlassDisplay({ gm, onError: (error) => errors.push(error) });
  await display.start();
  display.present(makeFrame());
  await waitFor(() => gm.displayCalls('updateImageLz4').length === 1, 'pending lifecycle frame');
  display.pause();
  const error = new Error('suspended');
  error.code = 'PERMISSION_DENIED';
  pending.reject(error);
  await display.idle();
  assert.deepEqual(errors, []);
  assert.equal(display.getStats().paused, true);
  display.stop();
});
