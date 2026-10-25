export const DOOM_WIDTH = 320;
export const DOOM_HEIGHT = 200;
export const DOOM_FRAME_BYTES = DOOM_WIDTH * DOOM_HEIGHT;

export function createEngineHost(module, { onFrame, onState, onError, onLog }) {
  let timer;
  let running = false;
  let started = false;
  let serial = 0;
  let lastStateAt = 0;
  let lastTickMs = 0;

  const reportError = (error) => {
    running = false;
    clearTimeout(timer);
    onError(error instanceof Error ? error : new Error(String(error)));
  };
  const state = () => ({
    type: 'state',
    gameState: module._MM_GameState(),
    tic: module._MM_GameTic(),
    x: module._MM_PlayerX(),
    y: module._MM_PlayerY(),
    angle: module._MM_PlayerAngle(),
    serial,
    lastTickMs,
    inputOverflows: module._MM_InputOverflows(),
    health: module._MM_PlayerHealth(),
    armor: module._MM_PlayerArmor(),
    weapon: module._MM_PlayerWeapon(),
    ammo: module._MM_PlayerAmmo(),
    weapons: module._MM_PlayerWeapons(),
    keys: module._MM_PlayerKeys(),
    menuActive: Boolean(module._MM_MenuActive()),
    demoPlayback: Boolean(module._MM_DemoPlayback()),
    running,
  });

  function emitFrame() {
    if (!module._MM_ConsumeFrame()) return;
    const framePointer = module._MM_Frame();
    const palettePointer = module._MM_Palette();
    if (!framePointer || !palettePointer) throw new Error('DOOM returned an empty frame');
    const indices = module.HEAPU8.slice(framePointer, framePointer + DOOM_FRAME_BYTES);
    const palette = module.HEAPU8.slice(palettePointer, palettePointer + 256 * 3);
    serial += 1;
    onFrame({ indices, palette, serial, gameState: module._MM_GameState() });
  }

  function schedule() {
    clearTimeout(timer);
    if (running) timer = setTimeout(tick, 4);
  }

  function tick() {
    if (!running || !started) return;
    const begin = performance.now();
    try {
      module._doomgeneric_Tick();
      emitFrame();
      lastTickMs = performance.now() - begin;
      if (begin - lastStateAt >= 250) {
        lastStateAt = begin;
        onState(state());
      }
      schedule();
    } catch (error) {
      reportError(error);
    }
  }

  return {
    start(wad) {
      if (started) throw new Error('DOOM is already started');
      try {
        module.FS.writeFile(`/${wad.name}`, wad.bytes);
        module.callMain(['-iwad', `/${wad.name}`, '-mb', '16', '-nosound']);
        started = true;
        running = true;
        emitFrame();
        onState(state());
        schedule();
      } catch (error) {
        reportError(error);
        throw error;
      }
    },
    press(key, pressed) {
      if (started) module._MM_QueueKey(key, pressed ? 1 : 0);
    },
    releaseAll() {
      if (started) module._MM_ReleaseKeys();
    },
    pause() {
      if (!started) return;
      module._MM_ReleaseKeys();
      running = false;
      clearTimeout(timer);
      onState(state());
    },
    resume() {
      if (!started || running) return;
      running = true;
      onState(state());
      schedule();
    },
    dispose() {
      running = false;
      clearTimeout(timer);
    },
    get running() { return running; },
    get started() { return started; },
  };
}
