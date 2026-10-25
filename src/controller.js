export const DOOM_KEYS = Object.freeze({
  LEFT: 0xac,
  UP: 0xad,
  RIGHT: 0xae,
  DOWN: 0xaf,
  USE: 0xa2,
  FIRE: 0xa3,
  STRAFE: 0x80 + 0x38,
  RUN: 0x80 + 0x36,
  MAP: 9,
  ENTER: 13,
  ESCAPE: 27,
});

export class InputState {
  constructor(emit) {
    this.emit = emit;
    this.sources = new Map();
    this.pressed = new Map();
  }

  press(source, key) {
    if (!Number.isInteger(key) || key < 0 || key > 255) return;
    const keys = this.sources.get(source) ?? new Set();
    if (keys.has(key)) return;
    keys.add(key);
    this.sources.set(source, keys);
    const owners = this.pressed.get(key) ?? new Set();
    if (owners.size === 0) this.emit(key, true);
    owners.add(source);
    this.pressed.set(key, owners);
  }

  release(source, key) {
    const keys = this.sources.get(source);
    if (!keys?.delete(key)) return;
    if (keys.size === 0) this.sources.delete(source);
    const owners = this.pressed.get(key);
    owners?.delete(source);
    if (owners?.size === 0) {
      this.pressed.delete(key);
      this.emit(key, false);
    }
  }

  releaseAll() {
    for (const key of this.pressed.keys()) this.emit(key, false);
    this.sources.clear();
    this.pressed.clear();
  }

  toggle(source, key) {
    if (this.sources.get(source)?.has(key)) {
      this.release(source, key);
      return false;
    }
    this.press(source, key);
    return true;
  }

  has(key) { return this.pressed.has(key); }
}

export function controlKey(control) {
  const name = control?.dataset?.key;
  if (name in DOOM_KEYS) return DOOM_KEYS[name];
  if (/^[1-8]$/.test(name)) return name.charCodeAt(0);
  if (/^[yn]$/i.test(name)) return name.toLowerCase().charCodeAt(0);
  return null;
}

const KEYBOARD = Object.freeze({
  ArrowLeft: 'LEFT', ArrowUp: 'UP', ArrowRight: 'RIGHT', ArrowDown: 'DOWN',
  Space: 'USE', ControlLeft: 'FIRE', ControlRight: 'FIRE',
  ShiftLeft: 'RUN', ShiftRight: 'RUN', AltLeft: 'STRAFE', AltRight: 'STRAFE',
  Tab: 'MAP', Enter: 'ENTER', Escape: 'ESCAPE',
});

export function keyboardKey(event) {
  if (KEYBOARD[event.code]) return DOOM_KEYS[KEYBOARD[event.code]];
  if (/^Digit[1-8]$/.test(event.code)) return event.code.slice(-1).charCodeAt(0);
  if (/^Key[YN]$/.test(event.code)) return event.code.slice(-1).toLowerCase().charCodeAt(0);
  return null;
}

export function createController({ root, onInput, onPause }) {
  const state = new InputState(onInput);
  const pointers = new Map();
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const controls = [...root.querySelectorAll('[data-key]')];
  let enabled = true;

  function showToggle(control, active) {
    control.classList.toggle('latched', active);
    control.setAttribute('aria-checked', String(active));
    const label = control.querySelector('[data-toggle-label]');
    if (label) label.textContent = active ? '已开' : '已关';
  }

  function releaseAll() {
    pointers.clear();
    state.releaseAll();
    for (const control of controls) {
      control.classList.remove('pressed');
      if (control.dataset.toggle === 'true') showToggle(control, false);
    }
  }

  function releasePointer(pointerId) {
    const pointer = pointers.get(pointerId);
    if (!pointer) return;
    pointers.delete(pointerId);
    state.release(`pointer:${pointerId}`, pointer.key);
    pointer.control.classList.remove('pressed');
  }

  for (const control of controls) {
    control.addEventListener('contextmenu', (event) => event.preventDefault(), options);
    if (control.dataset.toggle === 'true') {
      showToggle(control, false);
      control.addEventListener('click', () => {
        if (!enabled || control.disabled) return;
        const key = controlKey(control);
        if (key === null) return;
        showToggle(control, state.toggle(`toggle:${key}`, key));
      }, options);
      continue;
    }
    control.addEventListener('pointerdown', (event) => {
      if (!enabled || event.button > 0 || pointers.has(event.pointerId)) return;
      event.preventDefault();
      const key = controlKey(control);
      if (key === null) return;
      control.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { control, key });
      state.press(`pointer:${event.pointerId}`, key);
      control.classList.add('pressed');
      control.focus({ preventScroll: true });
    }, options);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      control.addEventListener(name, (event) => releasePointer(event.pointerId), options);
    }
  }

  function editableTarget(target) {
    return target instanceof Element && target.closest('input, select, textarea, [contenteditable="true"]');
  }

  window.addEventListener('keydown', (event) => {
    if (!enabled || editableTarget(event.target)) return;
    if (event.target?.dataset?.toggle === 'true' && ['Space', 'Enter'].includes(event.code)) {
      event.preventDefault();
      if (!event.repeat) event.target.click();
      return;
    }
    if (event.code === 'KeyP') {
      event.preventDefault();
      if (!event.repeat) onPause();
      return;
    }
    const key = keyboardKey(event);
    if (key === null) return;
    event.preventDefault();
    state.press(`keyboard:${event.code}`, key);
  }, options);
  window.addEventListener('keyup', (event) => {
    const key = keyboardKey(event);
    if (key === null) return;
    if (!editableTarget(event.target)) event.preventDefault();
    state.release(`keyboard:${event.code}`, key);
  }, options);
  window.addEventListener('blur', releaseAll, options);

  return {
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) releaseAll();
      root.classList?.toggle('input-disabled', !enabled);
      for (const control of controls) control.disabled = !enabled || control.dataset.unavailable === 'true';
    },
    releaseAll,
    has(key) { return state.has(key); },
    dispose() {
      listeners.abort();
      releaseAll();
    },
  };
}
