import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InputState, DOOM_KEYS, keyboardKey, createController } from '../src/controller.js';

test('toggle retains a modifier independently of a held keyboard source', () => {
  const events = [];
  const input = new InputState((...event) => events.push(event));
  assert.equal(input.toggle('switch', DOOM_KEYS.RUN), true);
  input.press('keyboard', DOOM_KEYS.RUN);
  assert.equal(input.toggle('switch', DOOM_KEYS.RUN), false);
  assert.equal(input.has(DOOM_KEYS.RUN), true);
  assert.deepEqual(events, [[DOOM_KEYS.RUN, true]]);
  input.release('keyboard', DOOM_KEYS.RUN);
  assert.deepEqual(events.at(-1), [DOOM_KEYS.RUN, false]);
});

test('phone switches latch on click, survive enabling, and clear on blur, pause and disposal', () => {
  class Toggle extends EventTarget {
    constructor(key) {
      super();
      this.dataset = { key, toggle: 'true' };
      this.label = { textContent: '' };
      this.attributes = new Map();
      this.classes = new Set();
      this.classList = {
        toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name),
        remove: (name) => this.classes.delete(name),
      };
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    querySelector() { return this.label; }
    click() { this.dispatchEvent(new Event('click')); }
  }
  const controls = ['STRAFE', 'RUN'].map((key) => new Toggle(key));
  const events = [];
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const controller = createController({ root: { querySelectorAll: () => controls }, onInput: (...event) => events.push(event), onPause() {} });
  try {
    for (const control of controls) {
      control.click();
      assert.equal(control.attributes.get('aria-checked'), 'true');
      assert.equal(control.label.textContent, '已开');
      assert.equal(control.classes.has('latched'), true);
    }
    controller.setEnabled(true);
    assert.equal(controller.has(DOOM_KEYS.RUN), true, 'routine HUD updates do not reset switches');
    controls[1].click();
    assert.equal(controller.has(DOOM_KEYS.RUN), false);
    assert.equal(controls[1].label.textContent, '已关');
    globalThis.window.dispatchEvent(new Event('blur'));
    for (const control of controls) assert.equal(control.attributes.get('aria-checked'), 'false');
    assert.equal(controller.has(DOOM_KEYS.STRAFE), false);
    controls[0].click();
    controller.setEnabled(false);
    assert.equal(controller.has(DOOM_KEYS.STRAFE), false);
    controls[0].click();
    assert.equal(controller.has(DOOM_KEYS.STRAFE), false, 'disabled switches ignore activation');
    controller.setEnabled(true);
    controls[1].click();
    controller.dispose();
    assert.equal(controller.has(DOOM_KEYS.RUN), false);
    assert.equal(controls[1].attributes.get('aria-checked'), 'false');
    assert.ok(events.some(([key, pressed]) => key === DOOM_KEYS.RUN && !pressed));
  } finally {
    controller.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('fire is momentary and releases on pointer up, cancellation, capture loss and blur', () => {
  class Fire extends EventTarget {
    constructor() {
      super();
      this.dataset = { key: 'FIRE' };
      this.classes = new Set();
      this.classList = { add: (value) => this.classes.add(value), remove: (value) => this.classes.delete(value) };
    }
    setPointerCapture() {}
    focus() {}
  }
  const fire = new Fire();
  const events = [];
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const controller = createController({ root: { querySelectorAll: () => [fire] }, onInput: (...event) => events.push(event), onPause() {} });
  const pointer = (type) => fire.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, button: 0 }));
  try {
    for (const release of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      pointer('pointerdown');
      assert.equal(controller.has(DOOM_KEYS.FIRE), true);
      pointer(release);
      assert.equal(controller.has(DOOM_KEYS.FIRE), false);
      assert.equal(fire.classes.has('pressed'), false);
      fire.dispatchEvent(new Event('click'));
      assert.equal(controller.has(DOOM_KEYS.FIRE), false, 'click must never latch fire on');
    }
    pointer('pointerdown');
    globalThis.window.dispatchEvent(new Event('blur'));
    assert.equal(controller.has(DOOM_KEYS.FIRE), false);
    assert.deepEqual(events.at(-1), [DOOM_KEYS.FIRE, false]);
  } finally {
    controller.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('multitouch keeps independent keys and shared keys release only after the last owner', () => {
  const events = [];
  const input = new InputState((key, pressed) => events.push([key, pressed]));
  input.press('pointer:1', DOOM_KEYS.UP);
  input.press('pointer:2', DOOM_KEYS.FIRE);
  input.press('pointer:3', DOOM_KEYS.UP);
  input.press('pointer:3', DOOM_KEYS.UP);
  input.release('pointer:1', DOOM_KEYS.UP);
  assert.deepEqual(events, [[DOOM_KEYS.UP, true], [DOOM_KEYS.FIRE, true]]);
  input.release('pointer:3', DOOM_KEYS.UP);
  assert.deepEqual(events.at(-1), [DOOM_KEYS.UP, false]);
  assert.equal(input.has(DOOM_KEYS.UP), false);
  assert.equal(input.has(DOOM_KEYS.FIRE), true);
  input.releaseAll();
  assert.deepEqual(events.at(-1), [DOOM_KEYS.FIRE, false]);
  assert.equal(input.has(DOOM_KEYS.FIRE), false);
});

test('blur-style release is idempotent and covers every held key', () => {
  const events = [];
  const input = new InputState((key, pressed) => events.push([key, pressed]));
  for (const key of [DOOM_KEYS.UP, DOOM_KEYS.FIRE, DOOM_KEYS.STRAFE, DOOM_KEYS.RUN]) {
    input.press('touch', key);
  }
  input.releaseAll();
  input.releaseAll();
  assert.equal(events.filter(([, pressed]) => !pressed).length, 4);
  assert.equal(events.filter(([, pressed]) => pressed).length, 4);
});

test('desktop keyboard maps real DOOM keys without depending on letters', () => {
  assert.equal(keyboardKey({ code: 'ControlLeft' }), DOOM_KEYS.FIRE);
  assert.equal(keyboardKey({ code: 'Space' }), DOOM_KEYS.USE);
  assert.equal(keyboardKey({ code: 'Digit7' }), '7'.charCodeAt(0));
  assert.equal(keyboardKey({ code: 'KeyY' }), 'y'.charCodeAt(0));
  assert.equal(keyboardKey({ code: 'F13' }), null);
});

test('document-style roots do not require an Element classList', async () => {
  const { createController } = await import('../src/controller.js');
  globalThis.window = { addEventListener() {} };
  try {
    const controller = createController({
      root: { querySelectorAll: () => [] },
      onInput() {}, onPause() {},
    });
    assert.doesNotThrow(() => controller.setEnabled(false));
    assert.doesNotThrow(() => controller.setEnabled(true));
    controller.dispose();
  } finally {
    delete globalThis.window;
  }
});
