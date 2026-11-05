#!/usr/bin/env node
/**
 * Симулятор баланса без графики: та же логика боя, что в игре (src/sim.js), и боты-«дети».
 *
 *   node tools/balance.mjs              — сводка в консоль
 *   node tools/balance.mjs --md FILE    — ещё и отчёт в Markdown (docs/BALANCE.md)
 *   node tools/balance.mjs --fit        — подобрать множитель HP для 2–4 игроков и вывести TEAM
 *   node tools/balance.mjs --seeds 24   — сколько партий на точку (по умолчанию 16)
 *
 * «Разумная» стратегия бота (каждый игрок — свой бот):
 *   - думает раз в 1–3 с (ребёнок не кликает каждый кадр);
 *   - если есть свободная плита и хватает ракушек — в 80 % случаев ставит подружку: в 60 % самую выгодную
 *     (урон/с × дальность / цена), иначе любую доступную; плиту — одну из четырёх лучших по охвату дороги;
 *   - иначе растит свою самую дешёвую в росте подружку («Подрасти»);
 *   - «Танцуем!» жмёт в трети случаев, когда тень прошла больше половины пути;
 *   - первую волну зовёт через 8 с после старта, дальше волны идут сами.
 */
import fs from 'node:fs';
import { Sim, FRIENDS, towerStats, waveInfo, mulberry32, START_TAILS, Path } from '../src/sim.js';
import { MAPS, spotsOf, pathsOf, teamLevel } from '../src/levels.js';
import { TEAM } from '../src/balance.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEEDS = Number(opt('--seeds', 16));
const DT = 1 / 30;
const MAX_T = 60 * 30;   // страховка: не дольше получаса игрового времени

/* ─────────────────── бот ─────────────────── */

function coverage(level, spot, range) {
  let n = 0;
  for (const pts of pathsOf(level)) {
    const path = new Path(pts);
    for (let d = 0; d < path.length; d += 1) {
      const p = path.at(d);
      if (Math.hypot(p.x - spot[0], p.z - spot[1]) <= range) n++;
    }
  }
  return n;
}

/** Лабиринт: сколько клеток текущего маршрута теней в радиусе (маршрут меняется после каждой постройки). */
function mazeCover(sim, k, range) {
  const s = sim.spots[k];
  let n = 0;
  for (const r of sim.mz.routes) for (const c of r || []) {
    const [x, z] = sim.mz.grid.center(c);
    if (Math.hypot(x - s.x, z - s.z) <= range) n++;
  }
  return n;
}

function makeBot(sim, pid, rng, cover) {
  let next = 1 + rng() * 2;
  return () => {
    if (sim.time < next) return;
    next = sim.time + 1 + rng() * 2;
    const p = sim.players.get(pid);
    const L = sim.level;
    const free = sim.spots.map((_, i) => i).filter((i) => !sim.towers.has(i) && sim.spots[i].ok);
    const affordable = L.friends.filter((f) => FRIENDS[f].cost <= p.shells);
    if (free.length && affordable.length && rng() < 0.8) {
      let f;
      if (rng() < 0.6) {
        f = affordable.reduce((a, b) => {
          const v = (id) => { const s = towerStats(id, 1); return (s.damage / s.rate) * (1 + (s.splash ? 0.6 : 0) + (s.slow ? 0.5 : 0)) * s.range / FRIENDS[id].cost; };
          return v(b) > v(a) ? b : a;
        });
      } else f = affordable[Math.floor(rng() * affordable.length)];
      if (sim.maze) {
        // лабиринт: лучшие по охвату маршрута клетки; постройку, перекрывающую путь, хост не примет — берём следующую
        const R = FRIENDS[f].range;
        const near = free.map((k) => [k, mazeCover(sim, k, R)]).sort((a, b) => b[1] - a[1]).slice(0, 8);
        while (near.length) {
          const pick = near.splice(Math.floor(rng() * Math.min(4, near.length)), 1)[0];
          if (sim.act(pid, { k: 'build', s: pick[0], f }).ok) break;
        }
      } else {
        const ranked = free.sort((a, b) => cover[f][b] - cover[f][a]).slice(0, 4);
        const s = ranked[Math.floor(rng() * ranked.length)];
        sim.act(pid, { k: 'build', s, f });
      }
    } else {
      let best = -1, cost = Infinity;
      for (const [s, t] of sim.towers) if (t.upCost < cost) { best = s; cost = t.upCost; }   // растить можно любую подружку команды
      if (best >= 0 && cost <= p.shells) sim.act(pid, { k: 'up', s: best });
    }
    if (sim.time >= sim.danceReady && sim.enemies.some((e) => e.rem < 40) && rng() < 0.33) {
      sim.act(pid, { k: 'dance' });
    }
  };
}

const coverCache = new Map();
function coverFor(level, spots) {
  if (level.maze) return null;
  const key = `${level.map}/${level.id}/${level.friends.length}`;
  if (!coverCache.has(key)) {
    const c = {};
    for (const f of level.friends) c[f] = spots.map((s) => coverage(level, s, FRIENDS[f].range));
    coverCache.set(key, c);
  }
  return coverCache.get(key);
}

/** Одна партия: n игроков-ботов на уровне, множители mult(n). */
export function play(level0, n, mult, seed, { working = n } = {}) {
  const level = n > 1 ? teamLevel(level0) : level0;
  const rng = mulberry32(seed);
  const spots = spotsOf(level);
  const players = Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const sim = new Sim(level, { players, spots, rng, mult });
  const cover = coverFor(level, spots);
  // working < n: остальные игроки в команде, но ничего не делают (отвлеклись, маленькие, ушли от экрана)
  const bots = players.slice(0, working).map((p) => makeBot(sim, p.id, mulberry32(seed * 31 + p.id), cover));
  let called = false;
  while (!sim.over && sim.time < MAX_T) {
    for (const b of bots) b();
    if (!called && sim.time > 8) { sim.act(1, { k: 'wave' }); called = true; }
    sim.step(DT);
    sim.events.length = 0;
  }
  let towers = 0, lv = 0;
  for (const t of sim.towers.values()) { towers++; lv += t.level; }
  const route = sim.maze ? sim.mz.routes[0].length : 0;
  const team = [...sim.players.values()];
  const towersOf = (id) => [...sim.towers.values()].filter((t) => t.owner === id).length;
  const spread = Math.max(...team.map((p) => towersOf(p.id))) - Math.min(...team.map((p) => towersOf(p.id)));
  const idleShells = team.reduce((v, p) => v + p.shells, 0) / team.length;
  const noTowers = team.filter((p) => !towersOf(p.id)).length;
  return { spread, idleShells, noTowers, route, won: sim.won, tails: Math.max(0, sim.tails), wave: sim.wave, towers, avgLevel: towers ? lv / towers : 0, time: sim.time };
}

function stats(level, n, mult, seeds = SEEDS) {
  let won = 0, health = 0, wave = 0, towers = 0, lvl = 0, min = 1, time = 0, route = 0;
  for (let s = 1; s <= seeds; s++) {
    const r = play(level, n, mult, s * 7919 + n);
    if (r.won) won++;
    const h = r.won ? r.tails / START_TAILS : 0;
    health += h; min = Math.min(min, h);
    wave += r.wave; towers += r.towers; lvl += r.avgLevel; time += r.time; route += r.route;
  }
  return { route: route / seeds, win: won / seeds, health: health / seeds, minHealth: min, wave: wave / seeds,
           towers: towers / seeds, avgLevel: lvl / seeds, minutes: time / seeds / 60 };
}

/* ─────────────────── подбор множителей ─────────────────── */

const only = opt('--level');   // например --level castle/3
const allLevels = Object.values(MAPS).filter((m) => !m.race && (!m.hidden || only)).flatMap((m) => m.levels).filter((l) => !only || only.split(',').includes(`${l.map}/${l.id}`));
const meanHealth = (n, mult) => {
  let h = 0;
  for (const l of allLevels) h += stats(l, n, mult).health;
  return h / allLevels.length;
};

/* ─────────────────── командная игра в неидеальных условиях ─────────────────── */

/** Команда из n, из которых реально играют working: победы и запас домика по всем уровням. */
function stress() {
  const seeds = Number(opt('--seeds', 8));
  const scen = [[1, 1], [2, 2], [3, 3], [4, 4], [2, 1], [3, 2], [3, 1], [4, 3], [4, 2], [4, 1]];
  const rows = [];
  for (const [n, working] of scen) {
    let won = 0, h = 0, games = 0, spread = 0, idle = 0, none = 0, worst = 1;
    for (const l of allLevels) {
      let lw = 0;
      for (let s = 1; s <= seeds; s++) {
        const r = play(l, n, (k) => TEAM[k], s * 7919 + n * 13 + working, { working });
        games++; if (r.won) { won++; lw++; h += r.tails / START_TAILS; }
        spread += r.spread; idle += r.idleShells; none += r.noTowers;
      }
      worst = Math.min(worst, lw / seeds);
    }
    rows.push([n, working, pct(won / games), pct(h / games), pct(worst), f1(spread / games), Math.round(idle / games), f1(none / games)]);
    console.log(`игроков ${n}, играют ${working}: побед ${pct(won / games)}, запас ${pct(h / games)}, худший уровень ${pct(worst)}, разница по подружкам ${f1(spread / games)}, неистрачено ракушек у игрока ${Math.round(idle / games)}, игроков без подружек ${f1(none / games)}`);
  }
  return rows;
}

function fit() {
  const solo = meanHealth(1, () => TEAM[1]);
  console.log(`соло: средний запас домика ${(solo * 100).toFixed(0)} %`);
  const out = { 1: TEAM[1] };
  const only = opt('--n');
  for (const n of only ? [Number(only)] : [2, 3, 4]) {
    const base = TEAM[n];
    let lo = 0.3, hi = 2.5 * n;
    for (let it = 0; it < 8; it++) {
      const mid = (lo + hi) / 2;
      const m = { ...base, hp: mid };
      const h = meanHealth(n, (k) => (k === n ? m : TEAM[k]));
      console.log(`  n=${n} hp×${mid.toFixed(3)} → ${(h * 100).toFixed(1)} %`);
      if (h > solo) lo = mid; else hi = mid;
    }
    out[n] = { ...base, hp: Math.round(((lo + hi) / 2) * 20) / 20 };
  }
  console.log('\nexport const TEAM = ' + JSON.stringify(out, null, 2).replace(/"(\w+)":/g, '$1:') + ';');
}

/* ─────────────────── отчёт ─────────────────── */

const pct = (x) => `${Math.round(x * 100)} %`;
const mazeBase = () => { const l = allLevels.find((x) => x.maze); return l ? new Sim(l, { players: [{ id: 1 }], spots: spotsOf(l) }).mz.routes[0].length : 0; };
const f1 = (x) => x.toFixed(1);

function dpsTable() {
  const rows = [];
  for (const [id, f] of Object.entries(FRIENDS)) {
    for (let L = 1; L <= 5; L++) {
      const s = towerStats(id, L);
      rows.push([L === 1 ? `${f.emoji} ${f.name}` : '', L, s.damage, s.rate.toFixed(2), f1(s.damage / s.rate), f1(s.range),
                 L === 1 ? f.cost : towerStats(id, L - 1).upCost, s.spent, (s.damage / s.rate / s.spent * 100).toFixed(1)]);
    }
  }
  return rows;
}

function waveTable(level) {
  const rows = [];
  for (const n of [1, 3, 5, 8, 10, 12, 15, 16, 18, 20]) {
    if (n > level.target) break;
    const cells = [n];
    for (const k of [1, 2, 3, 4]) {
      const w = waveInfo(n, level, TEAM[k]);
      cells.push(`${w.count}×${w.hp}${w.big ? ' (+босс ' + w.hp * 6 + ')' : ''}`);
    }
    const w1 = waveInfo(n, level, TEAM[1]);
    cells.splice(2, 0, f1(w1.speed));
    rows.push(cells);
  }
  return rows;
}

const md = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

function report(file) {
  const t0 = Date.now();
  const res = [];
  for (const l of allLevels) {
    const row = { l, n: {} };
    for (const n of [1, 2, 3, 4]) row.n[n] = stats(l, n, (k) => TEAM[k]);
    res.push(row);
    const s = [1, 2, 3, 4].map((n) => `${n}: ${pct(row.n[n].health).padStart(5)} побед ${pct(row.n[n].win).padStart(5)}`).join(' · ');
    console.log(`${l.map.padEnd(6)} ${String(l.id).padStart(2)} ${l.name.padEnd(20)} ${s}`);
  }
  const avg = (n, k) => res.reduce((s, r) => s + r.n[n][k], 0) / res.length;
  console.log('среднее запаса:', [1, 2, 3, 4].map((n) => `${n} игр. ${pct(avg(n, 'health'))}`).join(', '));
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} с)`);
  if (!file) return;

  const multRows = [1, 2, 3, 4].map((n) => [n, TEAM[n].hp, TEAM[n].count, TEAM[n].shells, TEAM[n].bounty, TEAM[n].bonus,
    f1(TEAM[n].hp * TEAM[n].count), f1(n * TEAM[n].count * TEAM[n].bounty)]);
  const lvlRows = res.map((r) => [MAPS[r.l.map].name, `${r.l.id}. ${r.l.name}`, r.l.target, spotsOf(r.l).filter((x) => x[2] !== 0).length, r.l.hpK ?? 1, (r.l.teamHp || []).join(' / '), pct(targetHealth(r.l)),
    ...[1, 2, 3, 4].map((n) => `${pct(r.n[n].health)} / ${pct(r.n[n].win)}`), f1(r.n[1].minutes)]);
  const quay = MAPS.quay.levels[4], castle = MAPS.castle.levels[2];
  const text = `# Баланс «Хвостов»: одиночная и командная игра

Отчёт собран симулятором \`node tools/balance.mjs --md docs/BALANCE.md\` (${SEEDS} партий на каждую клетку,
шаг 1/30 с, та же логика боя, что в браузере — \`src/sim.js\`). Множители живут в \`src/balance.js\`.

## Формулы

**Волна n** на уровне со скоростью \`speed\` и множителями команды из N игроков:

| Величина | Формула |
|---|---|
| теней в волне | \`round(min(3 + floor(0.9·n), 28) · count[N])\` |
| здоровье тени | \`round(24 · 1.2^(n−1) · speed · hpK · hp[N])\` — \`hpK\` у каждого уровня свой (таблица ниже) |
| скорость тени | \`min(2 + 0.03·n, 4.4) · speed\` |
| интервал выхода | \`max(0.4, 1.15 − 0.02·n) / √count[N]\` |
| награда за тень | \`round((6 + floor(n/2)) · bounty[N])\` — **каждому** игроку |
| бонус за волну | \`round((20 + 3·n) · bonus[N])\` — каждому |
| босс (каждая 5-я волна) | первая тень: HP×6, скорость×0.6, награда×5 |
| стартовые ракушки | \`round(level.shells · shells[N])\` — каждому |

**Подружка уровня роста L**: урон \`×1.6\`, дальность \`+2.5\`, перезарядка \`×0.9\`, цена следующего роста
\`×1.8\` (первый рост — 80 % цены подружки). DPS растёт в \`1.6/0.9 ≈ 1.78\` раза за рост, цена — в 1.8 раза:
урон в секунду на вложенную ракушку почти постоянный (см. таблицу).

**Что поменяно относительно исходной игры и почему.** В исходнике было урон \`×1.9\`, перезарядка \`×0.85\`,
цена \`×1.7\`, здоровье теней \`×1.16\` за волну и без \`hpK\`. Симулятор показал: DPS за рост \`×2.24\` при цене
\`×1.7\` — каждый следующий рост выгоднее предыдущего, урон растёт быстрее экспоненты здоровья теней, и бот
проходит **все** 15 исходных уровней с запасом 100 % (ни одной утащенной ленточки) даже при здоровье ×10.
Поэтому: рост подружек сделан «честным» (урон/с на ракушку не растёт), здоровье теней растёт \`×1.2\`
за волну, а общий уровень сложности каждого уровня задаёт \`hpK\`, подобранный бисекцией
(\`--fit-levels\`) под цель: запас домика 40 % на первом уровне карты → 20 % на последнем.

**Почему множители такие.** Суммарная «огневая мощь» команды ≈ N × (доход одного игрока),
суммарная прочность волны ≈ \`hp[N] · count[N]\`. Если каждому платить столько же, сколько одному, команда
из четырёх сметает всё (плит при этом столько же — 7–12 на уровень). Поэтому:

1. \`count\` растёт (больше друзей — больше теней, видно, что волна «командная»);
2. \`shells\`, \`bounty\` и \`bonus\` каждого снижаются — общий доход команды растёт медленнее числа игроков,
   и у каждого всё ещё хватает ракушек на свои 2–3 подружки;
3. \`hp\` подобран бисекцией (\`--fit\`) так, чтобы **средний запас домика в команде совпал с одиночной игрой**
   при той же «разумной» стратегии ботов. Одного общего числа мало: у уровней очень крутой «обрыв» сложности
   (±10 % здоровья — и от 90 % запаса до поражения), а замок с одной подружкой и 7 плитами переносит команду
   хуже, чем лабиринт. Поэтому у каждого уровня есть свой \`teamHp = [2, 3, 4 игрока]\` (\`--fit-team-levels\`,
   бисекция по 8 партий на точку) — он и используется в игре; общий \`hp\` из таблицы — для своих уровней
   из редактора.

## Команда в жизни: не все играют одинаково

Раньше волны считались по всем в команде, и стоило одному отвлечься, команда проигрывала всегда (0 % побед при любом составе,
проверка: \`node tools/balance.mjs --stress\`). Теперь:

* **Волны и доход считаются по тем, кто играет.** Кто не действовал \`IDLE_AFTER\` (30 с) — отошёл; перед каждой волной половина его ракушек
  уходит команде, дохода он не получает. Вернулся — снова в команде.
* **Подружку друга можно растить** на свои ракушки: нет плит — ракушки всё равно в деле. Подружку ушедшего можно и отправить домой.
* **Первые 2 волны плита держится для друга**, у которого ещё нет ни одной подружки: первый не займёт всё поле.
* **Большой команде запас** \`TEAM_EASE\` (×0.92 у троих, ×0.86 у четверых): договариваться труднее, а боты этого не знают.

## Персонаж в бою (src/sim.js, HERO)

| | |
|---|---|
| Жизни | 10 в начале, максимум 20, закончились — отдых 8 с, потом 5 жизней у домика (хвостики не страдают) |
| Удар | стоит 1 жизнь, раз в 0.6 с, досягаемость 5.5; мимо — жизнь не сгорает |
| Сила удара | тень −34 % здоровья, привидение −25 %, большая тень −8 %; в прыжке ×1.5 |
| Убил персонаж | ракушек нет; жизни: тень +4, привидение +5, большая +15 |
| Убила башня | ракушки всей команде, жизней нет |
| Тени бьют | рядом с персонажем (3.2): −1 жизнь (большая −3), раз в 1.5 с; ударив, замирают на 0.35 с |

Боты в симуляторе персонажем не пользуются, поэтому бой на цифры выше не влияет. Выгоднее всего добивать раненых башней: один удар вместо трёх.

## Множители (src/balance.js)

${md(['Игроков', 'hp', 'count', 'shells', 'bounty', 'bonus', 'прочность волны hp·count', 'доход команды с тени N·count·bounty'], multRows)}

## Подружки: урон в секунду по уровням роста

${md(['Подружка', 'Рост', 'Урон', 'Перезарядка, с', 'DPS', 'Дальность', 'Цена шага', 'Вложено всего', 'DPS на 100 ракушек'], dpsTable())}

## Волны: тени × здоровье по числу игроков

Набережная, уровень ${quay.id} «${quay.name}» (speed ${quay.speed}):

${md(['Волна', '1 игрок', 'скорость', '2 игрока', '3 игрока', '4 игрока'], waveTable(quay))}

Замок, уровень ${castle.id} «${castle.name}» (speed ${castle.speed}):

${md(['Волна', '1 игрок', 'скорость', '2 игрока', '3 игрока', '4 игрока'], waveTable(castle))}

## Итог по уровням: запас домика / доля побед

«Запас домика» — сколько хвостиков из 5 осталось в конце (поражение = 0 %), среднее по ${SEEDS} партиям.
Цель — победа с запасом 20–40 % при разумной стратегии и **одинаковая сложность для 1–4 игроков**.

${md(['Карта', 'Уровень', 'Волн', 'Плит', 'hpK', 'teamHp 2/3/4', 'Цель', '1 игрок', '2 игрока', '3 игрока', '4 игрока', 'Минут (соло)'], lvlRows)}

**Среднее по всем уровням:** ${[1, 2, 3, 4].map((n) => `${n} игр. — запас ${pct(avg(n, 'health'))}, побед ${pct(avg(n, 'win'))}`).join('; ')}.

## Как читать и что дальше

* Боты — не дети: они не ошибаются плитой и не забывают про ракушки дольше 2 секунд. Ребёнок 4–6 лет
  играет хуже бота, поэтому первые уровни обеих карт оставлены лёгкими (запас высокий), а цель 20–40 %
  относится к средним и последним уровням, где бот должен потеть.
* Проверить после правки чисел: \`npm run balance\` (сводка) и \`npm run balance:md\` (этот файл).
* Подобрать hp заново после изменения count/shells/bounty: \`node tools/balance.mjs --fit\` и вставить вывод в \`src/balance.js\`.
`;
  fs.writeFileSync(file, text);
  console.log('записано', file);
}

/** Цель по уровням: первый уровень карты — запас 40 %, последний — 20 %, между — линейно. */
export const targetHealth = (level) => {
  // первая партия должна заканчиваться победой: дальше сложность нарастает постепенно
  const easy = { 1: 0.85, 2: 0.62, 3: 0.48 }[level.id];
  if (easy) return easy;
  const n = MAPS[level.map].levels.length;
  return 0.4 - 0.2 * ((level.id - 1) / Math.max(1, n - 1));
};

function fitLevels() {
  const out = [];
  for (const l of allLevels) {
    const goal = targetHealth(l);
    let lo = 0.1, hi = 60;
    for (let it = 0; it < 11; it++) {
      const mid = Math.sqrt(lo * hi);
      const h = stats({ ...l, hpK: mid }, 1, (k) => TEAM[k]).health;
      if (h > goal) lo = mid; else hi = mid;
    }
    const k = Math.round(Math.sqrt(lo * hi) * 100) / 100;
    const got = stats({ ...l, hpK: k }, 1, (q) => TEAM[q]).health;
    out.push(`${l.map}/${l.id}: hpK ${k}  (цель ${pct(goal)}, вышло ${pct(got)})`);
    console.log(out[out.length - 1]);
  }
}

/** Подстройка по доле побед: подбор по запасу домика шумит, а игроку важнее, можно ли вообще победить. Цель — 45–85 % у каждого состава (первые уровни — выше). */
function tuneTeam() {
  const rounds = Number(opt('--rounds', 4));
  const LIM = [[1.0, 2.8], [1.1, 3.6], [1.2, 4.4]];
  for (const l0 of allLevels) {
    const hp = l0.teamHp.slice();
    const wins = [];
    const low = l0.id === 1 ? 0.85 : 0.45, high = l0.id === 1 ? 1.01 : 0.85;
    for (const n of [2, 3, 4]) {
      let k = hp[n - 2], w = 0;
      for (let r = 0; r < rounds; r++) {
        hp[n - 2] = k;
        w = stats({ ...l0, teamHp: hp }, n, (q) => TEAM[q]).win;
        if (w < low) k *= w < 0.25 ? 0.82 : 0.91;
        else if (w > high) k *= w >= 0.97 ? 1.12 : 1.06;
        else break;
        k = Math.round(Math.max(LIM[n - 2][0], Math.min(LIM[n - 2][1], k)) * 100) / 100;
      }
      hp[n - 2] = k;
      wins.push(pct(stats({ ...l0, teamHp: hp }, n, (q) => TEAM[q]).win));
    }
    console.log(`${l0.map}/${l0.id}: teamHp [${hp.join(', ')}]  побед ${wins.join(' / ')}`);
  }
}

/** Свой множитель здоровья для 2–4 игроков на каждом уровне: запас домика команды = запасу одного игрока. */
function fitTeamLevels() {
  for (const l0 of allLevels) {
    const l = { ...l0, teamHp: undefined };
    const solo = stats(l, 1, (k) => TEAM[k]).health;
    const res = [];
    for (const n of [2, 3, 4]) {
      let lo = 0.2, hi = 12;
      for (let it = 0; it < 8; it++) {
        const mid = Math.sqrt(lo * hi);
        const h = stats(l, n, (k) => (k === n ? { ...TEAM[k], hp: mid } : TEAM[k])).health;
        if (h > solo) lo = mid; else hi = mid;
      }
      res.push(Math.round(Math.sqrt(lo * hi) * 100) / 100);
    }
    console.log(`${l.map}/${l.id}: teamHp [${res.join(', ')}]  (соло ${pct(solo)})`);
  }
}

if (args.includes('--stress')) stress();
else if (args.includes('--tune-team')) tuneTeam();
else if (args.includes('--fit-team-levels')) fitTeamLevels();
else if (args.includes('--fit-levels')) fitLevels();
else if (args.includes('--fit')) fit();
else if (args.includes('--solo')) {
  for (const l of allLevels) {
    const s = stats(l, 1, (k) => TEAM[k]);
    console.log(`${l.map.padEnd(6)} ${String(l.id).padStart(2)} ${l.name.padEnd(20)} запас ${pct(s.health).padStart(5)} побед ${pct(s.win).padStart(5)} мин ${pct(s.minHealth)} волна ${f1(s.wave)} подружек ${f1(s.towers)} рост ${f1(s.avgLevel)} ${f1(s.minutes)} мин`);
  }
} else if (import.meta.url === `file://${process.argv[1]}`) report(opt('--md'));
