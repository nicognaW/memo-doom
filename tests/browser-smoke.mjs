import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDefaultWad } from '../src/wad.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = process.env.MEMOMIND_SDK_ROOT;
if (!repoRoot) throw new Error('Set MEMOMIND_SDK_ROOT; see docs/BUILD.md');
const artifacts = resolve(appRoot, '.artifacts/browser');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await mkdir(artifacts, { recursive: true });
await writeFile(resolve(artifacts, 'freedoom1.wad'), (await loadDefaultWad()).bytes);

const server = spawn(process.execPath, [
  resolve(repoRoot, 'PhoneSDK/tools/run-browser-studio.mjs'),
  '--plugin', resolve(appRoot, 'dist'), '--port', '4189',
], { cwd: resolve(repoRoot, 'PhoneSDK'), stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });
await new Promise((resolveReady, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Browser Studio startup timed out: ${serverLog}`)), 10000);
  server.stdout.on('data', (chunk) => {
    if (String(chunk).includes('http://127.0.0.1:4189')) {
      clearTimeout(timeout);
      resolveReady();
    }
  });
  server.once('error', reject);
  server.once('exit', (code) => {
    clearTimeout(timeout);
    reject(new Error(`Browser Studio exited ${code}: ${serverLog}`));
  });
});

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  args: ['--no-sandbox'],
});

async function grant(page, reload = false, requiredOnly = false) {
  if (reload) await page.locator('#reload').click();
  else await page.goto('http://127.0.0.1:4189', { waitUntil: 'networkidle' });
  const dialog = page.locator('dialog');
  await dialog.waitFor();
  for (const input of await dialog.locator('input').all()) {
    if (!requiredOnly || (await input.locator('..').textContent()).includes('必需')) await input.check();
  }
  await dialog.locator('button').first().click();
  const plugin = page.frameLocator('#plugin-frame');
  await plugin.locator('#start-game').waitFor();
  await page.waitForFunction(() => {
    const frame = document.querySelector('#plugin-frame');
    return frame?.contentDocument?.querySelector('#start-game')?.disabled === false;
  });
  return plugin;
}

function observeErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error('Browser page error:', error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
      errors.push(message.text());
      console.error('Browser console error:', message.text());
    }
  });
  return errors;
}

async function waitForPresented(page, count) {
  await page.waitForFunction((minimum) => {
    const frame = document.querySelector('#plugin-frame');
    const text = frame?.contentDocument?.querySelector('#telemetry')?.textContent ?? '';
    const match = text.match(/完成 (\d+) 帧/);
    return match && Number(match[1]) >= minimum;
  }, count, { timeout: 30000 });
}

async function gameState(page) {
  return page.evaluate(() => {
    const gamepad = document.querySelector('#plugin-frame').contentDocument.querySelector('#gamepad');
    return {
      state: Number(gamepad.dataset.gameState),
      tic: Number(gamepad.dataset.tic),
      x: Number(gamepad.dataset.playerX),
      y: Number(gamepad.dataset.playerY),
      angle: Number(gamepad.dataset.playerAngle),
    };
  });
}

async function hold(page, selector, milliseconds) {
  const box = await page.frameLocator('#plugin-frame').locator(selector).boundingBox();
  assert.ok(box, `${selector} must be visible`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await delay(milliseconds);
  await page.mouse.up();
  await delay(160);
}

async function start(page, plugin) {
  await plugin.locator('#start-game').click();
  await plugin.locator('#gamepad').waitFor({ state: 'visible', timeout: 45000 });
  await waitForPresented(page, 3);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#device-canvas');
    if (!canvas) return false;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let minimum = 255;
    let maximum = 0;
    for (let index = 1; index < pixels.length; index += 64) {
      minimum = Math.min(minimum, pixels[index]);
      maximum = Math.max(maximum, pixels[index]);
    }
    return maximum - minimum > 30;
  }, null, { timeout: 20000 });
}

async function enterLevel(plugin) {
  await plugin.locator('[data-key="ESCAPE"]').click();
  await delay(280);
  for (let index = 0; index < 3; index += 1) {
    await plugin.locator('[data-key="ENTER"]').click();
    await delay(280);
  }
  await plugin.locator('#gamepad[data-game-state="0"]').waitFor({ timeout: 15000 });
}

async function canvasColors(page) {
  return page.locator('#device-canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 16) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
    }
    return colors.size;
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  const errors = observeErrors(page);
  if (process.env.DOOM_STUDIO_INSPECT === '1') {
    await page.route('**/studio.js', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        'function subscribeRuntime() {',
        'function subscribeRuntime() { globalThis.__doomStudioRuntime = runtime;',
      );
      await route.fulfill({ response, body });
    });
  }
  const plugin = await grant(page);
  await start(page, plugin);
  assert.equal(await plugin.locator('#backend').textContent(), 'WASM');
  assert.equal(await plugin.locator('#diagnostics').evaluate((element) => element.open), false);
  assert.equal(await plugin.locator('#quality').inputValue(), 'smooth');
  await page.setViewportSize({ width: 768, height: 1000 });
  assert.equal(await plugin.locator('#telemetry').evaluate((element) => (
    getComputedStyle(element).whiteSpace === 'pre-line' && element.scrollWidth <= element.clientWidth + 1
  )), true, 'all diagnostic text wraps at phone width');
  assert.ok(await canvasColors(page) >= 8, 'real game pixels reach the virtual panel');
  await page.locator('#device-canvas').screenshot({ path: resolve(artifacts, 'native-title.png') });
  await plugin.locator('#quality').selectOption('native');

  await enterLevel(plugin);
  await plugin.locator('#hud-health').filter({ hasText: '100' }).waitFor();
  assert.equal(await plugin.locator('#hud-ammo').textContent(), '50');
  assert.equal(await plugin.locator('#hud-weapon').textContent(), '手枪');
  assert.equal(await plugin.locator('.weapon-grid [data-key="3"]').isDisabled(), true);
  assert.equal(await plugin.locator('.weapon-grid [data-key="2"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await plugin.locator('#combat-hud').evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
  await plugin.locator('#combat-hud').screenshot({ path: resolve(artifacts, 'hud-metrics.png') });
  await plugin.locator('.controls-layout').screenshot({ path: resolve(artifacts, 'hud-controls.png') });
  await page.evaluate(() => {
    const frame = document.querySelector('#plugin-frame');
    frame.style.width = '390px';
    frame.style.height = '900px';
    frame.style.aspectRatio = 'auto';
  });
  assert.equal(await plugin.locator('html').evaluate((element) => element.scrollWidth <= innerWidth), true);
  await page.locator('#plugin-frame').screenshot({ path: resolve(artifacts, 'hud-phone-390.png') });
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.evaluate(() => {
    const frame = document.querySelector('#plugin-frame');
    frame.style.width = '740px';
    frame.style.height = '420px';
  });
  assert.equal(await plugin.locator('html').evaluate((element) => element.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('#plugin-frame').evaluate((element) => element.parentElement.clientWidth >= element.clientWidth), true, 'landscape capture must not be clipped by the host');
  const landscapeGeometry = await plugin.locator('.controls-layout').evaluate((element) => ({
    bottom: element.getBoundingClientRect().bottom, height: innerHeight,
    sections: [...element.children].map((child) => ({ top: child.getBoundingClientRect().top, bottom: child.getBoundingClientRect().bottom })),
  }));
  assert.ok(landscapeGeometry.bottom <= landscapeGeometry.height, `all game controls fit landscape: ${JSON.stringify(landscapeGeometry)}`);
  await page.locator('#plugin-frame').screenshot({ path: resolve(artifacts, 'hud-landscape-740.png') });
  await page.evaluate(() => document.querySelector('#plugin-frame').removeAttribute('style'));
  await page.setViewportSize({ width: 768, height: 1000 });
  for (const key of ['STRAFE', 'RUN']) {
    const toggle = plugin.locator(`[data-key="${key}"]`);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-checked'), 'true');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
  }
  const runToggle = plugin.locator('[data-key="RUN"]');
  await runToggle.press('Space');
  assert.equal(await runToggle.getAttribute('aria-checked'), 'true');
  await runToggle.press('Enter');
  assert.equal(await runToggle.getAttribute('aria-checked'), 'false');
  const before = await gameState(page);
  await runToggle.click();
  await hold(page, '[data-key="UP"]', 650);
  assert.equal(await runToggle.getAttribute('aria-checked'), 'true', 'run stays enabled after a separate movement gesture');
  await runToggle.click();
  const moved = await gameState(page);
  assert.notDeepEqual([moved.x, moved.y], [before.x, before.y], 'pointer hold moves the player');
  await hold(page, '[data-key="RIGHT"]', 350);
  const turned = await gameState(page);
  assert.notEqual(turned.angle, before.angle, 'pointer hold turns the player');
  const strafeToggle = plugin.locator('[data-key="STRAFE"]');
  await strafeToggle.click();
  const beforeStrafe = await gameState(page);
  await hold(page, '[data-key="RIGHT"]', 250);
  assert.equal((await gameState(page)).angle, beforeStrafe.angle, 'latched strafe changes lateral movement without turning');
  await strafeToggle.click();

  const up = await plugin.locator('[data-key="UP"]').boundingBox();
  const fire = await plugin.locator('[data-key="FIRE"]').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: up.x + up.width / 2, y: up.y + up.height / 2, id: 1 },
      { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 2 },
    ],
  });
  await delay(400);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const fireButton = plugin.locator('[data-key="FIRE"]');
  assert.equal(await fireButton.getAttribute('data-toggle'), null, 'fire is not a switch');
  const ammoBeforeFire = Number(await plugin.locator('#hud-ammo').textContent());
  await hold(page, '[data-key="FIRE"]', 450);
  await page.waitForFunction((before) => Number(document.querySelector('#plugin-frame').contentDocument.querySelector('#hud-ammo').textContent) < before, ammoBeforeFire);
  await delay(600);
  const settledAmmo = await plugin.locator('#hud-ammo').textContent();
  await delay(650);
  assert.equal(await plugin.locator('#hud-ammo').textContent(), settledAmmo, 'released fire does not keep consuming bullets');
  await plugin.locator('[data-key="USE"]').click();
  await plugin.locator('[data-key="2"]').click();

  await plugin.locator('[data-key="RUN"]').click();
  await plugin.locator('[data-key="STRAFE"]').click();
  await plugin.locator('#pause-game').click();
  for (const key of ['STRAFE', 'RUN']) {
    assert.equal(await plugin.locator(`[data-key="${key}"]`).getAttribute('aria-checked'), 'false', 'pause clears every latched mode');
  }
  assert.match(await plugin.locator('#hud-hint').textContent(), /已暂停/);
  await delay(100);
  const paused = await gameState(page);
  await delay(350);
  assert.equal((await gameState(page)).tic, paused.tic, 'pause stops game tics');
  await plugin.locator('#resume-game').click();
  await page.waitForFunction((tic) => {
    const gamepad = document.querySelector('#plugin-frame').contentDocument.querySelector('#gamepad');
    return Number(gamepad.dataset.tic) > tic;
  }, paused.tic);

  await plugin.locator('#quality').selectOption('full');
  await waitForPresented(page, 8);
  await page.waitForFunction(() => document.querySelector('#transport-status').textContent.startsWith('CH9'));
  await page.locator('#device-canvas').screenshot({ path: resolve(artifacts, 'full-level.png') });

  await page.locator('#connected').uncheck();
  await delay(300);
  assert.equal(await plugin.locator('#resume-game').isDisabled(), true);
  assert.match(await plugin.locator('#hud-hint').textContent(), /连接已断开/);
  const disconnectedTic = (await gameState(page)).tic;
  await delay(250);
  assert.equal((await gameState(page)).tic, disconnectedTic);
  await page.locator('#connected').check();
  await delay(250);
  await plugin.locator('#resume-game').click();

  await page.locator('#lifecycle').selectOption('suspended');
  await delay(250);
  assert.match(await plugin.locator('#status').textContent(), /宿主生命周期为 suspended/);
  const suspendedTic = (await gameState(page)).tic;
  await delay(250);
  assert.equal((await gameState(page)).tic, suspendedTic);
  await page.locator('#lifecycle').selectOption('running');
  await delay(200);
  await plugin.locator('#resume-game').click();
  await page.screenshot({ path: resolve(artifacts, 'browser-studio.png'), fullPage: true });

  await grant(page);
  const chooserPromise = page.waitForEvent('filechooser');
  await plugin.locator('#import-wad').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(resolve(artifacts, 'freedoom1.wad'));
  await plugin.locator('#status').filter({ hasText: 'IWAD 验证通过' }).waitFor({ timeout: 15000 });
  await start(page, plugin);
  assert.match(await plugin.locator('#source-name').textContent(), /freedoom1\.wad/);
  console.log('Import status:', await plugin.locator('#status').textContent(), await plugin.locator('#error').textContent());
  if (process.env.DOOM_STUDIO_INSPECT === '1') {
    console.log('Storage before reload:', await page.evaluate(() => Object.fromEntries(globalThis.__doomStudioRuntime.storage)));
  }
  await grant(page, true);
  if (process.env.DOOM_STUDIO_INSPECT === '1') {
    console.log('Storage after reload:', await page.evaluate(() => Object.fromEntries(globalThis.__doomStudioRuntime.storage)));
  }
  console.log('Restore status:', await plugin.locator('#status').textContent(), await plugin.locator('#error').textContent());
  assert.match(await plugin.locator('#source-name').textContent(), /freedoom1\.wad/, 'saved file reference restores');
  assert.deepEqual(errors, [], 'no browser runtime or CSP errors');
  await page.close();

  const fallback = await browser.newPage({ viewport: { width: 1000, height: 800 }, hasTouch: true });
  const fallbackErrors = observeErrors(fallback);
  await fallback.addInitScript(() => {
    globalThis.Worker = undefined;
    globalThis.WebAssembly = undefined;
  });
  const fallbackPlugin = await grant(fallback, false, true);
  assert.equal(await fallbackPlugin.locator('#error').isHidden(), true, 'optional storage denial is a usable default, not a launch error');
  await start(fallback, fallbackPlugin);
  assert.equal(await fallbackPlugin.locator('#backend').textContent(), 'JS');
  assert.ok(await canvasColors(fallback) >= 8, 'pure JS main-thread fallback renders real pixels');
  await enterLevel(fallbackPlugin);
  await fallbackPlugin.locator('#hud-health').filter({ hasText: '100' }).waitFor();
  assert.equal(await fallbackPlugin.locator('#hud-ammo').textContent(), '50');
  await hold(fallback, '[data-key="FIRE"]', 400);
  await fallback.waitForFunction(() => Number(document.querySelector('#plugin-frame').contentDocument.querySelector('#hud-ammo').textContent) < 50);
  await fallback.locator('#device-canvas').screenshot({ path: resolve(artifacts, 'main-thread-js.png') });
  assert.deepEqual(fallbackErrors, [], 'no fallback runtime errors');
  await fallback.close();

  console.log(JSON.stringify({
    result: 'PASS', backend: 'WASM and main-thread JS',
    level: before, moved, turned, screenshots: artifacts,
  }, null, 2));
} catch (error) {
  console.error(error);
  console.error(serverLog.slice(-12000));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
