const WEAPONS = ['拳头', '手枪', '霰弹枪', '机枪', '火箭筒', '等离子枪', 'BFG', '电锯', '双管霰弹枪'];
const SLOTS = [[0, 7], [1], [2, 8], [3], [4], [5], [6]];
const AMMO_COST = [0, 1, 1, 1, 1, 1, 40, 0, 2];
const KEY_NAMES = ['蓝卡', '黄卡', '红卡', '蓝骷髅', '黄骷髅', '红骷髅'];

export function hudModel(state) {
  if (state?.gameState !== 0 || !Number.isInteger(state.weapon) || state.weapon < 0
      || state.weapon >= WEAPONS.length || !Number.isFinite(state.health) || !Number.isFinite(state.armor)
      || !Number.isInteger(state.ammo) || state.ammo < -1) {
    return { available: false, health: '—', armor: '—', ammo: '—', weapon: '等待进入关卡', keys: [], slots: [] };
  }
  const health = Math.max(0, Math.trunc(state.health));
  const armor = Math.max(0, Math.trunc(state.armor));
  const noAmmo = state.ammo === -1;
  const empty = !noAmmo && state.ammo < AMMO_COST[state.weapon];
  const dead = health === 0;
  return {
    available: true, health, armor, dead, empty, noAmmo,
    lowHealth: !dead && health <= 25,
    ammo: noAmmo ? '∞' : state.ammo,
    weapon: WEAPONS[state.weapon],
    keys: KEY_NAMES.filter((_, index) => (state.keys & (1 << index)) !== 0),
    slots: SLOTS.map((weapons, index) => ({
      key: String(index + 1),
      owned: weapons.some((weapon) => (state.weapons & (1 << weapon)) !== 0),
      selected: weapons.includes(state.weapon),
    })),
    hint: state.menuActive ? '菜单已打开 · 用前进 / 后退选择，按确认'
      : state.demoPlayback ? '演示画面 · 按菜单，再确认开始游戏'
        : dead ? '已阵亡 · 按「使用」重新开始'
        : empty ? '弹药不足 · 切换已拥有的武器'
          : health <= 25 ? '生命值偏低 · 寻找医疗包' : '状态已同步',
  };
}

export function createHud(root) {
  const panel = root.querySelector('#combat-hud');
  const health = root.querySelector('#hud-health');
  const armor = root.querySelector('#hud-armor');
  const ammo = root.querySelector('#hud-ammo');
  const weapon = root.querySelector('#hud-weapon');
  const keys = root.querySelector('#hud-keys');
  const hint = root.querySelector('#hud-hint');
  const slots = [...root.querySelectorAll('.weapon-grid [data-key]')];
  let lastState = null;
  let freshness = 'waiting';
  function render() {
    const model = hudModel(lastState);
    health.textContent = model.health;
    armor.textContent = model.armor;
    ammo.textContent = model.ammo;
    weapon.textContent = model.weapon;
    keys.textContent = !model.available ? '钥匙 · —' : `钥匙 · ${model.keys.join(' / ') || '尚未拾取'}`;
    panel.classList.toggle('low-health', Boolean(model.lowHealth));
    panel.classList.toggle('dead', Boolean(model.dead));
    panel.classList.toggle('empty-ammo', Boolean(model.empty));
    panel.dataset.freshness = freshness;
    panel.dataset.health = model.available ? String(model.health) : '';
    panel.dataset.ammo = model.available ? String(model.ammo) : '';
    hint.textContent = freshness === 'disconnected' ? '连接已断开 · 数值保留，等待重连'
      : freshness === 'paused' ? '已暂停 · 数值保留，按继续恢复'
        : model.available ? model.hint : '眼镜显示菜单 · 按菜单 / 确认开始游戏';
    for (const control of slots) {
      const slot = model.slots.find((value) => value.key === control.dataset.key);
      const unavailable = model.available && !slot?.owned;
      control.dataset.unavailable = String(unavailable);
      control.classList.toggle('unowned', unavailable);
      control.classList.toggle('selected-weapon', Boolean(slot?.selected));
      control.setAttribute('aria-pressed', String(Boolean(slot?.selected)));
      control.setAttribute('aria-label', `${control.textContent.trim()}${unavailable ? '，尚未获得' : ''}`);
    }
  }
  return {
    update(state) { lastState = state; render(); },
    setFreshness(value) { freshness = value; render(); },
    reset() { lastState = null; freshness = 'waiting'; render(); },
  };
}
