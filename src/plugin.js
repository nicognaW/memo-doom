import { createGMPlugin } from '../vendor/gm-plugin-web-sdk.esm.js';
import { EngineClient } from './engine-client.js';
import { readImportedWad } from './wad.js';
import { encodeDoomFrame } from './frame-codec.js';
import { GlassDisplay } from './glass-display.js';
import { createController } from './controller.js';
import { createHud } from './hud.js';

const STORAGE_KEY = 'doom-controller.selected-wad.v1';
const FRAME_INTERVAL_MS = 1000 / 30;
const DEFAULT_SOURCE = Object.freeze({
  kind: 'default',
  name: 'Freedoom 0.11.3 · Phase 1',
});

const byId = (id) => document.getElementById(id);
const ui = {
  setup: byId('setup-panel'),
  gamepad: byId('gamepad'),
  start: byId('start-game'),
  importWad: byId('import-wad'),
  useDefault: byId('use-default'),
  quality: byId('quality'),
  pause: byId('pause-game'),
  resume: byId('resume-game'),
  status: byId('status'),
  error: byId('error'),
  backend: byId('backend'),
  telemetry: byId('telemetry'),
  sourceName: byId('source-name'),
  sourceDetail: byId('source-detail'),
  connection: byId('connection'),
};

let gm = null;
let offLifecycle = null;
let hostRunning = true;
let engine = null;
let display = null;
let displayPermissionCheck = null;
let bridgeReady = false;
let destroyed = false;
let booting = false;
let starting = false;
let importing = false;
let sessionActive = false;
let userPaused = true;
let connected = false;
let selectedSource = { ...DEFAULT_SOURCE };
let epoch = 0;
let operationAbort = null;
let latestFrame = null;
let frameTimer = null;
let nextFrameAt = 0;
let encoding = false;
let droppedSourceFrames = 0;
let lastPresented = 0;
let errorOwner = null;
let lastEncodeMs = 0;
let lastEngineTickMs = 0;

const listeners = new AbortController();
const hud = createHud(document);
const listenerOptions = { signal: listeners.signal };
const controller = createController({
  root: document,
  onInput: (key, pressed) => {
    if (canInput()) engine.press(key, pressed);
  },
  onPause: pauseGame,
});
controller.setEnabled(false);

function isCurrent(ticket) {
  return !destroyed && ticket === epoch;
}

function canInput() {
  return !destroyed && hostRunning && sessionActive && engine?.ready === true && connected
    && !document.hidden && !userPaused;
}

function setStatus(message, isError = false) {
  if (destroyed) return;
  ui.status.textContent = message;
  ui.status.classList.toggle('error', isError);
}

function clearError(owner = null) {
  if (owner && errorOwner !== owner) return;
  ui.error.hidden = true;
  ui.error.textContent = '';
  errorOwner = null;
  ui.status.classList.remove('error');
}

function errorMessage(error) {
  const code = String(error?.code ?? '').toUpperCase();
  if (code === 'PERMISSION_DENIED') return '所需权限被拒绝或尚未授权';
  if (code === 'DEVICE_DISCONNECTED') return '眼镜连接已断开';
  if (code === 'CAPABILITY_UNAVAILABLE') return '当前宿主不支持此能力';
  return String(error?.message ?? error ?? '未知错误');
}

function showError(error, prefix, owner = 'app') {
  if (destroyed) return;
  const message = `${prefix}：${errorMessage(error)}`;
  errorOwner = owner;
  ui.error.textContent = message;
  ui.error.hidden = false;
  setStatus(message, true);
}

function updateSource() {
  ui.sourceName.textContent = selectedSource.name;
  ui.sourceDetail.textContent = selectedSource.kind === 'default'
    ? '内置 Freedoom 0.11.3 Phase 1，BSD 许可，完整游戏资源；不是原版商业 WAD。'
    : '已验证的导入 IWAD；启动时会从 App 私有存储重新读取。仅保存文件引用，不保存游戏进度。';
}

function updateConnection() {
  if (destroyed) return;
  if (connected) ui.connection.textContent = '已连接 / 显示通道';
  else if (display) ui.connection.textContent = '眼镜已断开';
  else ui.connection.textContent = bridgeReady ? 'Bridge 已就绪' : '等待 Bridge';
}

function updateControls() {
  const usable = bridgeReady && !destroyed;
  ui.start.disabled = destroyed || !hostRunning || starting || importing || booting;
  ui.importWad.disabled = !usable || starting || importing || booting;
  ui.useDefault.disabled = destroyed || starting || importing;
  ui.quality.disabled = destroyed || starting || importing;
  ui.pause.disabled = destroyed || !sessionActive || userPaused;
  ui.resume.disabled = destroyed || !sessionActive || !engine?.ready || !connected
    || !hostRunning || document.hidden || !userPaused;
  controller.setEnabled(canInput());
  document.body.classList.toggle('playing', sessionActive);
  ui.pause.hidden = !sessionActive || userPaused;
  ui.resume.hidden = !sessionActive || !userPaused;
  hud.setFreshness(sessionActive && !connected ? 'disconnected'
    : sessionActive && userPaused ? 'paused' : sessionActive ? 'live' : 'waiting');
  updateConnection();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function updateTelemetry() {
  if (destroyed) return;
  if (!display) {
    ui.telemetry.textContent = '尚未发送';
    return;
  }
  const stats = display.getStats();
  ui.telemetry.textContent = `近3秒 ${stats.recentFps.toFixed(1)} 帧/秒 · ${formatBytes(stats.recentBytesPerSecond)}/秒 · 单帧 ${formatBytes(stats.lastBytes)}\n发送 ${stats.lastSendMs.toFixed(0)} ms · 当前等待 ${stats.inFlightMs.toFixed(0)} ms · ${stats.lz4Available ? 'LZ4' : '未压缩'}\n编码 ${lastEncodeMs.toFixed(1)} ms · 压缩 ${stats.lastPrepareMs.toFixed(1)} ms · 引擎 ${lastEngineTickMs.toFixed(1)} ms\n完成 ${stats.presented} 帧 / 尝试 ${stats.attempted} · ${formatBytes(stats.bytesSent)} · 丢帧 ${stats.dropped + droppedSourceFrames} · 重试 ${stats.retries} · 错误 ${stats.errors}`;
  if (stats.presented > lastPresented) {
    lastPresented = stats.presented;
    if (errorOwner === 'display') {
      clearError('display');
      if (sessionActive && !userPaused) setStatus('显示发送已恢复，游戏运行中。');
    }
  }
}

function clearFrameQueue() {
  if (frameTimer !== null) clearTimeout(frameTimer);
  frameTimer = null;
  latestFrame = null;
  nextFrameAt = 0;
}

function scheduleFrameEncoding() {
  if (frameTimer !== null || encoding || destroyed) return;
  const delay = Math.max(0, nextFrameAt - performance.now());
  frameTimer = setTimeout(encodeLatestFrame, delay);
}

function encodeLatestFrame() {
  frameTimer = null;
  if (destroyed || !latestFrame || !sessionActive || userPaused || !connected || document.hidden) return;
  const frame = latestFrame;
  latestFrame = null;
  encoding = true;
  try {
    const encodeStarted = performance.now();
    const encoded = encodeDoomFrame(frame.indices, frame.palette, {
      fullScreen: ui.quality.value === 'full',
      smooth: ui.quality.value === 'smooth',
    });
    lastEncodeMs = performance.now() - encodeStarted;
    display?.present(encoded);
  } catch (error) {
    showError(error, '画面编码失败', 'display');
  } finally {
    encoding = false;
    nextFrameAt = performance.now() + FRAME_INTERVAL_MS;
  }
  if (latestFrame) scheduleFrameEncoding();
}

function receiveFrame(frame, ticket) {
  if (!isCurrent(ticket) || !sessionActive || userPaused || !connected || document.hidden) return;
  if (latestFrame) droppedSourceFrames += 1;
  latestFrame = frame;
  scheduleFrameEncoding();
}

function handleLifecycle(state) {
  hostRunning = state === 'running';
  if (!hostRunning) {
    pauseForLifecycle(`宿主生命周期为 ${state}，已暂停模拟和显示。`);
    if (state === 'stopped' || state === 'failed') shutdown();
    return;
  }
  if (sessionActive) setStatus('宿主已恢复，游戏保持暂停。按 RESUME 继续。');
  updateControls();
}

function pauseForLifecycle(reason) {
  if (destroyed) return;
  if (starting || engine || sessionActive) userPaused = true;
  controller.releaseAll();
  engine?.releaseAll();
  engine?.pause();
  display?.pause();
  clearFrameQueue();
  if (engine || sessionActive) setStatus(reason);
  updateControls();
}

function pauseGame() {
  if (destroyed || !sessionActive) return;
  userPaused = true;
  pauseForLifecycle('已暂停。按 RESUME 继续。');
}

function resumeGame() {
  if (destroyed || !sessionActive || !engine?.ready) return;
  if (!connected) {
    setStatus('眼镜尚未连接，保持暂停。', true);
    return;
  }
  if (document.hidden) return;
  clearError();
  userPaused = false;
  nextFrameAt = 0;
  display?.resume();
  engine.resume();
  setStatus('运行中。按 ESC 打开菜单，ENTER 选择新游戏、章节和难度。');
  updateControls();
}

async function handleDisplayError(error, ticket) {
  if (String(error?.code ?? '').toUpperCase() !== 'PERMISSION_DENIED') {
    showError(error, '眼镜显示', 'display');
    return;
  }
  try {
    const check = displayPermissionCheck ??= gm.runtime.getLifecycleState();
    const lifecycle = await check.finally(() => {
      if (displayPermissionCheck === check) displayPermissionCheck = null;
    });
    if (!isCurrent(ticket)) return;
    if (lifecycle?.state !== 'running') {
      handleLifecycle(lifecycle?.state);
      return;
    }
    failSession(error, ticket, '眼镜显示权限失败');
  } catch (checkError) {
    if (isCurrent(ticket)) failSession(checkError, ticket, '眼镜权限状态检查失败');
  }
}

function handleDisplayStatus(stats, ticket) {
  if (!isCurrent(ticket)) return;
  const changed = connected !== stats.connected;
  connected = stats.connected;
  if (changed && !connected) {
    pauseForLifecycle('眼镜连接已断开，模拟和显示均已暂停；重连后请按 RESUME。');
  } else if (changed && connected && userPaused) {
    engine?.pause();
    clearFrameQueue();
    setStatus('眼镜已重连并等待完整帧同步。按 RESUME 继续。');
  }
  updateControls();
  updateTelemetry();
}

function failSession(error, ticket, prefix = '启动失败') {
  if (!isCurrent(ticket)) return;
  epoch += 1;
  operationAbort?.abort();
  operationAbort = null;
  starting = false;
  sessionActive = false;
  userPaused = true;
  controller.setEnabled(false);
  clearFrameQueue();
  engine?.releaseAll();
  engine?.pause();
  display?.pause();
  ui.setup.hidden = false;
  ui.gamepad.hidden = true;
  showError(error, prefix);
  updateControls();
}

function stopSession() {
  epoch += 1;
  operationAbort?.abort();
  operationAbort = null;
  sessionActive = false;
  userPaused = true;
  controller.setEnabled(false);
  clearFrameQueue();
  display?.stop();
  display = null;
  engine?.dispose();
  engine = null;
  connected = false;
  droppedSourceFrames = 0;
  lastPresented = 0;
  lastEncodeMs = 0;
  lastEngineTickMs = 0;
  hud.reset();
}

async function startGame() {
  if (destroyed || starting || importing) return;
  if (!hostRunning) {
    setStatus('宿主尚未运行，恢复后再启动。');
    return;
  }
  if (!bridgeReady) {
    await boot();
    if (!bridgeReady || destroyed) return;
  }

  stopSession();
  const ticket = epoch;
  starting = true;
  userPaused = false;
  operationAbort = new AbortController();
  clearError();
  ui.setup.hidden = false;
  ui.gamepad.hidden = true;
  ui.backend.textContent = '加载中';
  setStatus('正在准备游戏资源和眼镜显示…');
  updateControls();

  try {
    const source = { ...selectedSource };
    let wad = { kind: 'default' };
    if (source.kind === 'imported') {
      setStatus('正在读取并验证导入的 IWAD…');
      const validated = await readImportedWad(gm, source, operationAbort.signal);
      if (!isCurrent(ticket)) return;
      wad = { kind: 'imported', name: validated.name, bytes: validated.bytes };
    }

    display = new GlassDisplay({
      gm,
      onStatus: (stats) => handleDisplayStatus(stats, ticket),
      onError: (error) => {
        if (isCurrent(ticket)) void handleDisplayError(error, ticket);
      },
    });
    await display.start();
    if (!isCurrent(ticket)) return;
    connected = display.getStats().connected;
    updateControls();

    engine = new EngineClient({
      onFrame: (frame) => receiveFrame(frame, ticket),
      onState: (state) => {
        if (!isCurrent(ticket)) return;
        lastEngineTickMs = Number.isFinite(state.lastTickMs) ? state.lastTickMs : 0;
        hud.update(state);
        controller.setEnabled(canInput());
        ui.gamepad.dataset.gameState = String(state.gameState);
        ui.gamepad.dataset.tic = String(state.tic);
        ui.gamepad.dataset.playerX = String(state.x);
        ui.gamepad.dataset.playerY = String(state.y);
        ui.gamepad.dataset.playerAngle = String(state.angle);
      },
      onStatus: (phase) => {
        if (isCurrent(ticket) && starting) setStatus(`引擎：${phase}`);
      },
      onError: (error) => failSession(error, ticket, '引擎运行失败'),
      onBackend: (backend) => {
        if (isCurrent(ticket)) ui.backend.textContent = backend === 'wasm' ? 'WASM' : 'JS';
      },
    });
    setStatus(source.kind === 'default' ? '正在解压并启动完整 Freedoom…' : '正在启动导入的 IWAD…');
    await engine.start(wad);
    if (!isCurrent(ticket)) return;

    sessionActive = true;
    starting = false;
    operationAbort = null;
    ui.setup.hidden = true;
    ui.gamepad.hidden = false;
    if (userPaused || document.hidden || !connected) {
      userPaused = true;
      engine.pause();
      display.pause();
      setStatus('游戏已就绪并保持暂停。连接和页面恢复后按 RESUME。');
    } else {
      setStatus('运行中。按 ESC 打开菜单，ENTER 选择新游戏、章节和难度。');
    }
    updateControls();
    updateTelemetry();
  } catch (error) {
    if (error?.name === 'AbortError' && !isCurrent(ticket)) return;
    failSession(error, ticket);
  } finally {
    if (isCurrent(ticket)) {
      starting = false;
      updateControls();
    }
  }
}

async function restoreSource(ticket) {
  try {
    const saved = await gm.storage.get(STORAGE_KEY);
    if (!isCurrent(ticket)) return;
    const value = saved?.value;
    if (!value || typeof value.fileId !== 'string' || typeof value.name !== 'string') return;
    const result = await gm.files.stat(value.fileId);
    if (!isCurrent(ticket)) return;
    const file = result?.file;
    if (!file || file.fileId !== value.fileId) throw new Error('保存的 IWAD 已不存在');
    selectedSource = {
      kind: 'imported',
      fileId: file.fileId,
      name: file.name || value.name,
      size: file.size,
    };
    updateSource();
  } catch (error) {
    if (!isCurrent(ticket)) return;
    selectedSource = { ...DEFAULT_SOURCE };
    updateSource();
    if (String(error?.code ?? '').toUpperCase() === 'PERMISSION_DENIED') return;
    showError(error, '未能恢复上次资源，已回退到内置 Freedoom');
  }
}

async function importWad() {
  if (destroyed || !bridgeReady || starting || importing) return;
  importing = true;
  const ticket = epoch;
  operationAbort = new AbortController();
  clearError();
  updateControls();

  try {
    const picked = await gm.files.pick({ extensions: ['wad'], allowMultiple: false });
    if (!isCurrent(ticket)) return;
    const file = picked?.files?.[0];
    if (!file) {
      setStatus('已取消导入，当前资源选择不变。');
      return;
    }
    setStatus('正在读取并验证 IWAD…');
    await readImportedWad(gm, file, operationAbort.signal);
    if (!isCurrent(ticket)) return;
    selectedSource = {
      kind: 'imported',
      fileId: file.fileId,
      name: file.name,
      size: file.size,
    };
    updateSource();
    setStatus('IWAD 验证通过。按“启动 DOOM”开始。');
    try {
      await gm.storage.set(STORAGE_KEY, { fileId: file.fileId, name: file.name });
    } catch (error) {
      if (isCurrent(ticket)) showError(error, '资源已选择，但无法保存引用；本次仍可启动');
    }
  } catch (error) {
    if (isCurrent(ticket) && error?.name !== 'AbortError') {
      showError(error, '导入失败；当前资源选择不变');
    }
  } finally {
    if (isCurrent(ticket)) {
      operationAbort = null;
      importing = false;
      updateControls();
    }
  }
}

async function useDefault() {
  if (destroyed || starting || importing) return;
  selectedSource = { ...DEFAULT_SOURCE };
  updateSource();
  clearError();
  setStatus('已选择内置完整 Freedoom 0.11.3。');
  if (bridgeReady) {
    try {
      await gm.storage.remove(STORAGE_KEY);
    } catch (error) {
      if (!destroyed && String(error?.code ?? '').toUpperCase() !== 'PERMISSION_DENIED') {
        showError(error, '已选择内置资源，但无法清除保存的引用');
      }
    }
  }
}

async function boot() {
  if (destroyed || booting || bridgeReady) return;
  booting = true;
  const ticket = epoch;
  clearError();
  setStatus('正在连接 MemoMind Bridge…');
  updateControls();
  try {
    if (!gm) gm = createGMPlugin({ timeoutMs: 4000 });
    await gm.ready();
    if (!isCurrent(ticket)) return;
    const lifecycle = await gm.runtime.getLifecycleState();
    if (!isCurrent(ticket)) return;
    hostRunning = lifecycle?.state === 'running';
    offLifecycle?.();
    offLifecycle = gm.on('runtime.lifecycleChanged', ({ state }) => handleLifecycle(state));
    bridgeReady = true;
    await restoreSource(ticket);
    if (!isCurrent(ticket)) return;
    if (errorOwner === null) {
      setStatus(hostRunning ? 'Bridge 已就绪。使用内置 Freedoom 或导入合法 IWAD。' : '宿主已暂停，恢复运行后可启动。');
    }
  } catch (error) {
    if (isCurrent(ticket)) showError(error, 'Bridge 连接失败；按“启动 DOOM”可重试');
  } finally {
    if (isCurrent(ticket)) {
      booting = false;
      updateControls();
    }
  }
}

function shutdown() {
  if (destroyed) return;
  destroyed = true;
  epoch += 1;
  operationAbort?.abort();
  operationAbort = null;
  clearInterval(telemetryTimer);
  clearFrameQueue();
  listeners.abort();
  offLifecycle?.();
  offLifecycle = null;
  display?.stop();
  display = null;
  engine?.dispose();
  engine = null;
  controller.dispose();
  gm?.close();
}

ui.start.addEventListener('click', () => { void startGame(); }, listenerOptions);
ui.importWad.addEventListener('click', () => { void importWad(); }, listenerOptions);
ui.useDefault.addEventListener('click', () => { void useDefault(); }, listenerOptions);
ui.pause.addEventListener('click', pauseGame, listenerOptions);
ui.resume.addEventListener('click', resumeGame, listenerOptions);
ui.quality.addEventListener('change', () => {
  latestFrame = null;
  if (sessionActive) setStatus(`画质已切换为 ${ui.quality.selectedOptions[0].textContent}。`);
}, listenerOptions);
window.addEventListener('blur', () => pauseForLifecycle('窗口失焦，已暂停。返回后按 RESUME 继续。'), listenerOptions);
window.addEventListener('pagehide', shutdown, listenerOptions);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForLifecycle('页面已隐藏，模拟和显示均已暂停。');
  else if (sessionActive) setStatus('页面已恢复，游戏保持暂停。按 RESUME 继续。');
  updateControls();
}, listenerOptions);

const telemetryTimer = setInterval(updateTelemetry, 500);
updateSource();
updateControls();
updateTelemetry();
void boot();
