import test from 'node:test';
import assert from 'node:assert/strict';
import { hudModel } from '../src/hud.js';

const live = { gameState: 0, health: 100, armor: 0, weapon: 1, ammo: 50, weapons: 3, keys: 0 };

test('HUD preserves actual health, armor, current weapon and shared ammo pool', () => {
  const model = hudModel({ ...live, health: 200, armor: 150 });
  assert.equal(model.health, 200);
  assert.equal(model.armor, 150);
  assert.equal(model.weapon, '手枪');
  assert.equal(model.ammo, 50);
  assert.equal(model.slots[1].selected, true);
  assert.equal(model.slots[0].owned, true);
  assert.equal(model.slots[2].owned, false);
});

test('HUD handles empty ammo, weapon costs, melee, death and low health without fake numbers', () => {
  assert.equal(hudModel({ ...live, health: 25 }).lowHealth, true);
  assert.equal(hudModel({ ...live, health: -5 }).health, 0);
  assert.equal(hudModel({ ...live, health: -5 }).dead, true);
  assert.match(hudModel({ ...live, health: 0 }).hint, /阵亡/);
  assert.equal(hudModel({ ...live, ammo: 0 }).empty, true);
  assert.equal(hudModel({ ...live, weapon: 6, ammo: 39 }).empty, true);
  assert.equal(hudModel({ ...live, weapon: 8, ammo: 1 }).empty, true);
  assert.equal(hudModel({ ...live, weapon: 0, ammo: -1 }).ammo, '∞');
  assert.equal(hudModel({ ...live, weapon: 7, ammo: -1 }).empty, false);
  assert.equal(hudModel({ ...live, gameState: 3 }).available, false);
  assert.equal(hudModel(null).health, '—');
  assert.equal(hudModel({ ...live, ammo: -2 }).available, false);
});

test('HUD resolves all keys, alternative slot weapons and menu instructions', () => {
  const model = hudModel({ ...live, keys: 63, weapon: 8, weapons: 1 << 8, menuActive: true });
  assert.deepEqual(model.keys, ['蓝卡', '黄卡', '红卡', '蓝骷髅', '黄骷髅', '红骷髅']);
  assert.equal(model.slots[2].selected, true);
  assert.equal(model.slots[2].owned, true);
  assert.match(model.hint, /菜单/);
  assert.match(hudModel({ ...live, demoPlayback: true }).hint, /演示画面/);
});
