import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEngineHost, DOOM_FRAME_BYTES } from '../src/engine-core.js';
import { loadEngine } from '../src/engine-loader.js';
import { loadDefaultWad } from '../src/wad.js';
import { DOOM_KEYS } from '../src/controller.js';
import { encodeDoomFrame } from '../src/frame-codec.js';
import { compressLz4 } from '../src/lz4.js';

const bundledWad = loadDefaultWad();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, message, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await delay(25);
  }
  throw new Error(`Timed out: ${message}`);
}

for (const backend of ['wasm', 'js']) {
  test(`real DOOM engine enters a level and accepts controls (${backend})`, { timeout: 60000 }, async () => {
    const logs = [];
    const runtime = await loadEngine({ forceJavaScript: backend === 'js', onLog: (line) => logs.push(line) });
    assert.equal(runtime.backend, backend, `the ${backend} backend was actually exercised`);
    const { module } = runtime;
    let frame;
    let state;
    let failure;
    let sampling = false;
    const payloads = [];
    const host = createEngineHost(module, {
      onFrame: (value) => {
        frame = value;
        if (sampling && backend === 'wasm' && payloads.length < 40) {
          const native = compressLz4(encodeDoomFrame(value.indices, value.palette).gray4).length;
          const smooth = compressLz4(encodeDoomFrame(value.indices, value.palette, { smooth: true }).gray4).length;
          payloads.push({ native, smooth });
        }
      },
      onState: (value) => { state = value; },
      onError: (error) => { failure = error; },
    });
    try {
      const wad = await bundledWad;
      host.start({ ...wad, bytes: wad.bytes.slice() });
      await until(() => new Set(frame.indices).size > 8, 'real title frame is rendered');
      assert.equal(frame.indices.length, DOOM_FRAME_BYTES);
      assert.equal(frame.palette.length, 768);
      assert.ok(new Set(frame.indices).size > 8, 'real title frame has indexed pixels');
      assert.ok(frame.palette.some((value) => value !== 0), 'real IWAD palette loaded');
      assert.equal(state.gameState, 3, 'DOOM starts at its demo/menu screen');

      host.press(DOOM_KEYS.ESCAPE, true);
      await delay(100);
      host.press(DOOM_KEYS.ESCAPE, false);
      await delay(180);
      for (let index = 0; index < 3; index += 1) {
        host.press(DOOM_KEYS.ENTER, true);
        await delay(100);
        host.press(DOOM_KEYS.ENTER, false);
        await delay(180);
      }
      await until(() => {
        if (failure) throw failure;
        return state?.gameState === 0 && state.tic > 0;
      }, 'first level starts');
      const before = { ...state };
      assert.equal(state.health, 100, 'HUD reads actual initial health');
      assert.equal(state.armor, 0, 'HUD reads initial armor');
      assert.equal(state.weapon, 1, 'actual pistol is equipped');
      assert.equal(state.ammo, 50, 'actual initial ammo pool');
      assert.equal(state.weapons & 3, 3, 'fist and pistol are owned');
      assert.equal(state.keys, 0);
      sampling = true;
      host.press(DOOM_KEYS.UP, true);
      await delay(650);
      host.press(DOOM_KEYS.UP, false);
      await delay(100);
      assert.notDeepEqual([state.x, state.y], [before.x, before.y], 'forward input moves the actual player');
      host.press(DOOM_KEYS.RIGHT, true);
      await delay(350);
      host.press(DOOM_KEYS.RIGHT, false);
      await delay(100);
      assert.notEqual(state.angle, before.angle, 'turn input changes the actual view angle');
      sampling = false;
      if (backend === 'wasm') {
        assert.ok(payloads.length >= 5, 'sample actual moving gameplay frames');
        const native = payloads.reduce((sum, frame) => sum + frame.native, 0) / payloads.length;
        const smooth = payloads.reduce((sum, frame) => sum + frame.smooth, 0) / payloads.length;
        console.log(JSON.stringify({ movingFrames: payloads.length, nativeBytes: Math.round(native), smoothBytes: Math.round(smooth), ratio: smooth / native }));
        assert.ok(smooth < native * 0.65, 'smooth mode must reduce actual moving-frame payload by at least 35%');
      }
      const ammoBeforeFire = module._MM_PlayerAmmo();
      host.press(DOOM_KEYS.FIRE, true);
      await delay(100);
      host.press(DOOM_KEYS.FIRE, false);
      host.press(DOOM_KEYS.USE, true);
      await delay(100);
      host.press(DOOM_KEYS.USE, false);
      host.press('2'.charCodeAt(0), true);
      await delay(100);
      host.press('2'.charCodeAt(0), false);
      host.releaseAll();
      await until(() => frame.serial > state.serial, 'new gameplay frames are rendered');
      assert.equal(failure, undefined, logs.join('\n'));
      await until(() => state.ammo < ammoBeforeFire, 'HUD ammo decreases after actual firing');
      host.press('1'.charCodeAt(0), true);
      await delay(100);
      host.press('1'.charCodeAt(0), false);
      await until(() => state.weapon === 0, 'HUD follows actual switch to fist');
      assert.equal(state.ammo, -1, 'melee is explicitly unlimited, not zero ammo');

      host.pause();
      const pausedTic = state.tic;
      await delay(180);
      assert.equal(state.tic, pausedTic, 'pause stops simulation time');
      host.resume();
      await until(() => state.tic > pausedTic, 'resume advances simulation');
    } finally {
      host.dispose();
    }
  });
}
