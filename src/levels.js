/**
 * Уровни: набережные Герцег-Нови, от простой Топлы до крепости Канли-Кула.
 * Маршрут задаётся ломаной, площадки под подружек расставляются сами вдоль неё.
 */

import { mazeSpots } from "./sim.js";
import { Grid } from "./grid.js";
import { decode, toLevel } from "./custom.js";

/* ── генераторы маршрутов ── */

const zig = (n, w, z0, dz) => {              // змейка: n колен шириной w
  const p = [];
  for (let i = 0; i <= n; i++) {
    const x = i % 2 ? w : -w;
    p.push([i % 2 ? -w : w, z0 + i * dz], [x, z0 + i * dz]);
  }
  return p;
};

const spiral = (turns, r0, dr) => {           // спираль внутрь
  const p = [];
  const steps = turns * 8;
  for (let i = 0; i <= steps; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = r0 - i * dr;
    p.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return p;
};

const ring = (r, from = 0, to = Math.PI * 2, steps = 20) => {
  const p = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + (to - from) * (i / steps);
    p.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return p;
};

/**
 * Площадки: по обе стороны от маршрута, не ближе 4.6 к дороге и 5.5 друг к другу.
 */
export function makeSpots(path, limit = 12, maxR = 43) {
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const near = (p, list, r) => list.some((q) => dist2(p, q) < r * r);
  const spots = [];
  for (let i = 0; i < path.length - 1 && spots.length < limit; i++) {
    const a = path[i], b = path[i + 1];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    for (const side of [1, -1]) {
      const p = [mx + (-dz / len) * 5.2 * side, mz + (dx / len) * 5.2 * side];
      if (Math.hypot(p[0], p[1]) > maxR) continue;
      if (near(p, path, 4.6) || near(p, spots, 5.5)) continue;
      spots.push(p);
      if (spots.length >= limit) break;
    }
  }
  return spots;
}

/**
 * Карта «Набережная»: уровни идут по порядку, пройденный открывает следующий.
 * hpK — множитель здоровья теней, подобран симулятором (tools/balance.mjs --fit-levels, docs/BALANCE.md);
 * teamHp — множитель здоровья для команды из 2/3/4 игроков (--fit-team-levels): запас домика как у одного.
 * «разумная» стратегия проходит уровень с запасом домика 40 % на первом уровне карты → 20 % на последнем.
 */
export const LEVELS = [
  {
    id: 1, hpK: 6.1, teamHp: [1.2, 1.3, 1.4], name: 'Топла', hint: 'Первая набережная. Тени идут медленно — тут учимся.',
    path: [[-38, -14], [-26, -14], [-20, -4], [-20, 8], [-8, 15], [6, 15], [13, 6], [13, -6], [22, -13], [33, -13], [37, -4], [37, 6]],
    enemy: 'dancer', friends: ['mila', 'teya'], shells: 130, target: 8, speed: 0.9,
    sky: 0x8fd4e8, sea: 0x1f7fa8, land: 0x86a86a,
  },
  {
    id: 2, hpK: 5.79, teamHp: [1.49, 1.77, 2.07], name: 'Игало', hint: 'Длинная дуга у воды: тени успевают разогнаться.',
    path: [[-40, 6], [-28, 12], [-14, 14], [0, 10], [10, 2], [16, -8], [26, -14], [38, -12]],
    enemy: 'dancer', friends: ['mila', 'teya', 'niksha'], shells: 140, target: 10, speed: 1,
    sky: 0x9fdcea, sea: 0x1d86ad, land: 0x8fae6f,
  },
  {
    id: 3, hpK: 10.29, teamHp: [2.16, 2.1, 2.12], name: 'Савина', hint: 'Кипарисы и повороты — стреляй из-за угла.',
    path: zig(4, 20, -22, 10), enemy: 'dancer', friends: ['mila', 'teya', 'niksha'],
    shells: 150, target: 12, speed: 1.05, sky: 0x93d3df, sea: 0x1b7796, land: 0x7fa063,
  },
  {
    id: 4, hpK: 11.55, teamHp: [1.67, 3.09, 3.82], name: 'Шкверская лестница', hint: 'Тысяча ступенек вниз. Здесь появляются новые тени.',
    path: zig(6, 24, -30, 9), enemy: 'maskot', friends: ['mila', 'teya', 'niksha', 'iva'],
    shells: 170, target: 12, speed: 1.1, sky: 0x8ecbd8, sea: 0x1a6f8e, land: 0x86a86a,
  },
  {
    id: 5, hpK: 4.36, teamHp: [1.54, 2.53, 3.48], name: 'Пет Даница', hint: 'Семь километров вдоль моря — самая длинная дорога.',
    path: [[-42, -18], [-30, -14], [-30, -2], [-16, 2], [-16, 16], [-2, 20], [8, 14], [8, 0], [20, -4], [20, -18], [32, -20], [40, -12], [40, 4]],
    enemy: 'maskot', friends: ['mila', 'teya', 'niksha', 'iva'], shells: 180, target: 14, speed: 1.15,
    sky: 0x9adbe6, sea: 0x1f7fa8, land: 0x8cae6c,
  },
  {
    id: 6, hpK: 7.05, teamHp: [1.62, 3.4, 3.82], name: 'Стари град', hint: 'Улочки закручиваются к площади Белависта.',
    path: spiral(3, 38, 1.4), enemy: 'maskot', friends: ['mila', 'teya', 'niksha', 'iva', 'maskot'],
    shells: 200, target: 15, speed: 1.15, sky: 0xa9d8dd, sea: 0x1c7591, land: 0x9aa878,
  },
  {
    id: 7, hpK: 3.74, teamHp: [1.49, 3.06, 4.14], name: 'Белависта', hint: 'Площадь с часами: тени идут широким кругом.',
    path: [...ring(34, Math.PI, -Math.PI * 0.2, 16), ...ring(16, -Math.PI * 0.2, Math.PI * 1.2, 14)],
    enemy: 'maskot', friends: ['mila', 'teya', 'niksha', 'iva', 'maskot'],
    shells: 210, target: 16, speed: 1.2, sky: 0x9ed2e2, sea: 0x1b7392, land: 0x93a875,
  },
  {
    id: 8, hpK: 2.85, teamHp: [1.64, 1.54, 2.5], name: 'Форте-Маре', hint: 'Узкая стена над водой — плит мало, выбирай с умом.',
    path: [[-40, 14], [-24, 16], [-8, 12], [4, 4], [6, -8], [18, -16], [32, -14], [40, -2]],
    enemy: 'maskot', friends: ['teya', 'niksha', 'iva', 'maskot'], spots: 7,
    shells: 220, target: 16, speed: 1.25, sky: 0x8ec7d6, sea: 0x186a88, land: 0xa39a76,
  },
  {
    id: 9, hpK: 2.23, teamHp: [2.76, 3.6, 4.4], name: 'Мамула', hint: 'Остров посреди Боки: тени обходят его по кругу.',
    path: ring(30, Math.PI * 0.9, -Math.PI * 1.1, 24), enemy: 'maskot',
    friends: ['mila', 'teya', 'niksha', 'iva', 'maskot'], shells: 230, target: 18, speed: 1.3,
    sky: 0x86bfd2, sea: 0x14607e, land: 0x87a06a,
  },
  {
    id: 10, hpK: 4.48, teamHp: [2.6, 3.4, 1.99], name: 'Канли-Кула', hint: 'Крепость на горе. Сюда идут самые быстрые тени.',
    path: zig(8, 26, -34, 8), enemy: 'maskot', friends: ['mila', 'teya', 'niksha', 'iva', 'maskot'],
    shells: 250, target: 20, speed: 1.4, sky: 0x7fb6cc, sea: 0x125777, land: 0x8d9a6a,
  },
];

/* ─────────────────── карта «Замок» ─────────────────── */

const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t));
};
export const pathDist = (p, path) => {
  let m = Infinity;
  for (let i = 0; i < path.length - 1; i++) m = Math.min(m, segDist(p, path[i], path[i + 1]));
  return m;
};

/** Где стоит домик: в 5 единицах за концом маршрута (как в игре). */
export const housePos = (path) => {
  const a = path[path.length - 2], b = path[path.length - 1];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [b[0] + ((b[0] - a[0]) / l) * 5, b[1] + ((b[1] - a[1]) / l) * 5];
};

/**
 * Плиты под замок: замок 4-й стадии ≈ 10 в ширину, поэтому плиты не ближе 7.5 к оси дороги
 * и 12.5 друг к другу. Жадно берём место, откуда простреливается больше всего дороги.
 * Детерминированно: на каждом компьютере одна и та же раскладка (это важно для командной игры).
 */
export function castleSpots(path, n = 7, range = 16) {
  const samples = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const k = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
    for (let j = 0; j < k; j++) samples.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  const house = housePos(path);
  const cand = [];
  for (let x = -40; x <= 40; x += 2) {
    for (let z = -40; z <= 40; z += 2) {
      const p = [x, z];
      if (Math.hypot(x, z) > 41) continue;
      const d = pathDist(p, path);
      if (d < 7.5 || d > 11) continue;
      if (Math.hypot(x - house[0], z - house[1]) < 10 || Math.hypot(x - path[0][0], z - path[0][1]) < 7) continue;
      cand.push({ p, cover: samples.filter((s) => Math.hypot(s[0] - x, s[1] - z) <= range).length });
    }
  }
  const spots = [];
  while (spots.length < n) {
    let best = null;
    for (const c of cand) {
      if (spots.some((s) => Math.hypot(s[0] - c.p[0], s[1] - c.p[1]) < 12.5)) continue;
      if (!best || c.cover > best.cover) best = c;
    }
    if (!best) break;
    spots.push(best.p);
  }
  return spots;
}

/**
 * Цепочка «Замок»: башня игрока — замок, он растёт 1 → 4 при «Подрасти»
 * (assets/castle/stage1..4.glb). Привидений больше, чем на набережной, и с каждым уровнем — ещё больше.
 */
export const CASTLE_LEVELS = [
  {
    id: 1, hpK: 9.2, teamHp: [1.44, 2.48, 1.77], name: 'Ворота', hint: 'Построй замок и расти его: башня → стена → мост → крепость!',
    speech: 'Уровень Замок. Ставь башню на плиту и расти её!',
    path: [[-40, -20], [-16, -20], [-16, -6], [16, -6], [16, 8], [-12, 8], [-12, 22], [40, 22]],
    spotsList: [[-28, -11], [0, -13], [26, -14], [0, 1], [-26, 6], [28, 14], [6, 15]],
    enemy: 'dancer', friends: ['castle'], shells: 140, target: 8, speed: 0.95, ghosts: 0.3,
    sky: 0x9fd2e6, sea: 0x1d7aa0, land: 0x8fae6f,
  },
  {
    id: 2, hpK: 9, teamHp: [1.51, 1.1, 1.48], name: 'Ров', hint: 'Тени обходят ров. Замок у поворота бьёт по двум дорожкам сразу.',
    path: [[-40, -26], [-22, -26], [-22, 2], [2, 2], [2, -24], [24, -24], [24, 26], [36, 26]],
    spots: 7, enemy: 'dancer', friends: ['castle'], shells: 150, target: 10, speed: 1.0, ghosts: 0.35,
    sky: 0x9ccde0, sea: 0x1b7396, land: 0x86a86a,
  },
  {
    id: 3, hpK: 5.99, teamHp: [1.23, 2.77, 1.27], name: 'Подъёмный мост', hint: 'Длинный прямой мост — тени бегут быстро. Расти замки повыше!',
    path: [[-40, 0], [-26, 0], [-26, -26], [0, -26], [0, 26], [26, 26], [26, 0], [40, 0]],
    spots: 7, enemy: 'dancer', friends: ['castle'], shells: 160, target: 12, speed: 1.1, ghosts: 0.4,
    sky: 0x95c6dc, sea: 0x186d90, land: 0x8aa66c,
  },
  {
    id: 4, hpK: 6.94, teamHp: [1.29, 1.3, 1.75], name: 'Двор с колодцем', hint: 'Дорожка закручивается к колодцу. Привидений всё больше!',
    path: [[-34, -30], [28, -30], [28, 26], [-26, 26], [-26, -10], [12, -10], [12, 10], [-8, 10]],
    spots: 8, enemy: 'maskot', friends: ['castle'], shells: 180, target: 14, speed: 1.15, ghosts: 0.45,
    sky: 0x8fbfd6, sea: 0x166689, land: 0x93a875,
  },
  {
    id: 5, hpK: 5.49, teamHp: [1.48, 3.4, 1.78], name: 'Тронный зал', hint: 'Последний зал: тени быстрые, привидения — через одно. Держись!',
    path: [[-38, -26], [-12, -26], [-12, -12], [-34, -12], [-34, 4], [-4, 4], [-4, -18], [24, -18], [24, 14], [-18, 14], [-18, 30], [30, 30]],
    spots: 8, enemy: 'maskot', friends: ['castle'], shells: 200, target: 16, speed: 1.25, ghosts: 0.5,
    sky: 0x86b4cc, sea: 0x135d7e, land: 0x8d9a6a,
  },
];

/* ─────────────────── карты ─────────────────── */

/** Экспериментальная карта: только в экспериментальной сборке, при создании можно включить friendly fire. */
export const LAB_LEVELS = [
  {
    id: 1, hpK: 5.2, teamHp: [1.4, 1.8, 2.2], name: 'Арена', hint: 'Круг у домика: тени идут вокруг, а союзник рядом. Поделишься ракушками или отберёшь?',
    path: ring(30, Math.PI * 0.9, -Math.PI * 1.1, 24), house: [0, 0], enemy: 'dancer', friends: ['mila', 'teya', 'niksha', 'iva', 'castle'],
    shells: 200, target: 12, speed: 1, ghosts: 0.35, players: '2–4', spots: 12, sky: 0xb7a6e8, sea: 0x3b2a7a, land: 0x8f8fb0,
  },
];

/** Гонки в космическом тоннеле (src/race.js): трасса задаётся параметрами, строит её race-sim.js. */
export const RACE_LEVELS = [
  { id: 1, name: 'Орбита', hint: 'Широкие проходы и пологие виражи: привыкни к заносу.', seed: 11, length: 2600, vmax: 70, drift: 0.5, coil: [46, 340], sway: 40, gap: 230, hole: 6.2, kinds: ['gate', 'rocks', 'gate', 'half'], target: 3 },
  { id: 2, name: 'Кольца', hint: 'Быстрее и круче, появляются вращающиеся балки.', seed: 27, length: 3400, vmax: 85, drift: 0.65, coil: [62, 300], sway: 50, gap: 200, hole: 5.4, kinds: ['gate', 'rocks', 'half', 'bar'], target: 3 },
  { id: 3, name: 'Чёрная дыра', hint: 'Самый длинный и крутой тоннель. На такой скорости заносит всерьёз!', seed: 42, length: 4400, vmax: 100, drift: 0.8, coil: [80, 270], sway: 60, gap: 180, hole: 4.8, kinds: ['gate', 'bar', 'rocks', 'half', 'bar'], target: 3 },
];

export const MAPS = {
  quay: {
    id: 'quay', name: 'Набережная', emoji: '🎀', preview: 'assets/preview-tails.jpg', notInMenu: true,   // в главном меню не показываем; в командной игре и редакторе остаётся
    about: 'Десять мест Герцег-Нови: подружки на плитах не пускают тени к домику.', levels: LEVELS,
  },
  castle: {
    id: 'castle', name: 'Замок', emoji: '🏰', preview: 'assets/castle/preview.jpg',
    about: 'Пять залов замка: строй башни и расти их до настоящей крепости. Тут водятся привидения!',
    levels: CASTLE_LEVELS,
  },
  race: {
    id: 'race', name: 'Гонка', emoji: '🚀', preview: 'assets/preview-race.jpg', race: true,
    about: 'Космический тоннель: лети на своём корабле, стреляй по соперникам и не вылети на вираже.',
    levels: RACE_LEVELS,
  },
  lab: {
    id: 'lab', name: 'Эксперимент', emoji: '🧪', preview: 'assets/preview-boka.jpg', hidden: true,
    about: 'Арена для опытов: можно включить friendly fire.',
    levels: LAB_LEVELS,
  },
};
for (const m of Object.values(MAPS)) for (const l of m.levels) l.map = m.id;

export const mapById = (id) => MAPS[id] || MAPS.quay;

/** Уровень по карте и номеру. Старые ссылки ?level=castle → первый зал замка. */
export function levelById(mapId, id) {
  if (id === 'castle') { mapId = 'castle'; id = 1; }
  const m = mapById(mapId);
  return m.levels.find((l) => l.id === Number(id)) || m.levels[0];
}

/** Плиты уровня: ручные, замковые или вдоль дороги. */
export function spotsOf(level) {
  if (level.spotsList) return level.spotsList;
  if (level.maze) return mazeSpots(level);
  if (level.map === 'castle') return castleSpots(level.path, level.spots || 7);
  if (level.paths) {                 // несколько дорожек: плиты вдоль каждой поровну, без наложений
    const per = Math.ceil((level.spots || 12) / level.paths.length);
    const all = [];
    for (const p of level.paths) {
      let n = 0;
      for (const s of makeSpots(p, per * 3, 50)) {
        if (n >= per) break;
        if (all.some((q) => Math.hypot(q[0] - s[0], q[1] - s[1]) < 5.5)) continue;
        if (level.paths.some((pp) => pathDist(s, pp) < 4.6)) continue;
        if (level.house && Math.hypot(s[0] - level.house[0], s[1] - level.house[1]) < 7) continue;
        all.push(s); n++;
      }
    }
    return all;
  }
  return makeSpots(level.path, level.spots || 12);
}

/** Где домик: явно (уровни с несколькими дорожками) или за концом дорожки. */
export const houseOf = (level) => {
  if (level.house) return level.house;
  if (level.maze) { const g = new Grid(level.maze.w, level.maze.h); return g.center(g.idx(...level.maze.house)); }
  return housePos(level.path);
};

/** Все дорожки уровня (для лабиринта — пусто: маршрут считается на лету). */
export const pathsOf = (level) => (level.maze ? [] : level.paths || [level.path]);

/** В командной игре замок можно строить на любой карте. */
export const teamLevel = (level) => (level.friends.includes('castle') ? level : { ...level, friends: [...level.friends, 'castle'] });

/** Уровень любой карты, включая свои (map=custom, code=…). */
export function resolveLevel(mapId, id, code) {
  if (mapId === 'custom') {
    const d = decode(code);
    return d ? toLevel(d) : null;
  }
  return levelById(mapId, id);
}

/* ── прогресс в localStorage: отдельно для каждой карты ── */

const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);
const get = (k, d) => { try { const v = ls()?.getItem(k); return v === null || v === undefined ? d : v; } catch (e) { return d; } };
const set = (k, v) => { try { ls()?.setItem(k, String(v)); } catch (e) { /* без памяти */ } };

/* Кто уже играл до 1.9 (на телефоне есть сохранения «tg.»), тому открыты все уровни; новые игроки проходят по порядку.
   Отметка ставится один раз при первом запуске этой версии. */
(() => {
  const s = ls();
  if (!s || s.getItem('tg.allOpen') !== null) return;
  let old = false;
  for (let i = 0; i < s.length; i++) if (/^tg\./.test(s.key(i) || '')) { old = true; break; }
  set('tg.allOpen', old ? 1 : 0);
})();

export const progress = {
  unlocked(map) { return get('tg.allOpen', '0') === '1' ? mapById(map).levels.length : Number(get(`tg.${map}.unlocked`, 1)); },
  unlock(map, id) {
    if (id > this.unlocked(map) && id <= mapById(map).levels.length) set(`tg.${map}.unlocked`, id);
  },
  stars(map, id) { return Number(get(`tg.${map}.stars.${id}`, 0)); },
  setStars(map, id, n) { if (n > this.stars(map, id)) set(`tg.${map}.stars.${id}`, n); },
  best(map, id) { return Number(get(`tg.${map}.best.${id}`, 0)); },
  setBest(map, id, wave) { if (wave > this.best(map, id)) set(`tg.${map}.best.${id}`, wave); },
  totalStars(map) { return mapById(map).levels.reduce((s, l) => s + this.stars(map, l.id), 0); },
};
