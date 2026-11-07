#!/usr/bin/env node
/** Трассы из блоков без графики: код, развилки и слияния, змейка, примеры, боты не пролетают сквозь преграды. node tools/race-design-test.mjs */
import { EXAMPLES, analyze, buildCourse, decode, encode, keyOf, trackName, T, DIFFS, CELL } from '../src/race-design.js';
import { newRacer, stepRacer, botInput, hits, routeOf, TUBE_R, BODY_R } from '../src/race-sim.js';

let fails = 0;
const check = (ok, what) => { console.log(`${ok ? '✔' : '✘'} ${what}`); if (!ok) fails++; };
const DT = 1 / 60;
const line = (blocks, from, d, n, t = T.path) => { let c = from; for (let i = 0; i < n; i++) { c = [c[0] + d[0], c[1] + d[1], c[2] + d[2]]; blocks.set(keyOf(...c), t); } return c; };

/* код */
for (const d of EXAMPLES) {
  const back = decode(encode(d));
  check(back && encode(back) === encode(d) && back.d === d.d && trackName(back) === trackName(d), `код туда и обратно: ${trackName(d)} (${encode(d).length} знаков)`);
}
check(decode('r1AAA' + '!!!') === null && decode('zzz') === null && decode('r1AAAA') === null && decode('') === null, 'испорченный код не принимается');

/* змейка из соседних рядов не срезается */
{
  const b = new Map(); b.set(keyOf(1, 0, 1), T.start);
  let c = line(b, [1, 0, 1], [1, 0, 0], 8); c = line(b, c, [0, 0, 1], 1); c = line(b, c, [-1, 0, 0], 8);
  c = line(b, c, [0, 0, 1], 1); c = line(b, c, [1, 0, 0], 7); b.set(keyOf(...c), T.finish);
  const a = analyze({ blocks: b });
  check(a.ok && a.routes.length === 1 && a.routes[0].chain.length === b.size, `змейка пройдена целиком: ${a.routes[0]?.chain.length} из ${b.size}`);
}
/* развилка и слияние, тупик */
{
  const b = new Map(); b.set(keyOf(1, 0, 5), T.start);
  let c = line(b, [1, 0, 5], [1, 0, 0], 4); b.set(keyOf(...c), T.fork); const f = c;
  let u = line(b, f, [0, 0, 1], 3); u = line(b, u, [1, 0, 0], 6); u = line(b, u, [0, 0, -1], 2);
  let l = line(b, f, [1, 0, 0], 6); b.set(keyOf(...l), T.fork);
  b.set(keyOf(l[0], 0, l[2] + 1), T.path); // u приходит сюда: (11,0,6)
  let e = line(b, l, [1, 0, 0], 4); b.set(keyOf(...e), T.finish);
  line(b, [3, 0, 5], [0, 0, -1], 3);        // тупик
  const a = analyze({ blocks: b });
  check(a.ok && a.routes.length === 2, `развилка даёт два пути: ${a.routes.length} (${a.errors})`);
  check(!a.used.has(keyOf(3, 0, 2)), 'тупик в трассу не входит');
  const noF = new Map(b); noF.delete(keyOf(...e));
  check(!analyze({ blocks: noF }).ok, 'без финиша трасса не готова');
  const cut = new Map(b); cut.delete(keyOf(13, 0, 5));
  check(/не доходит/.test(analyze({ blocks: cut }).errors[0]), 'разрыв перед финишем показывается');
  const short = new Map(); short.set(keyOf(0, 0, 0), T.start); short.set(keyOf(1, 0, 0), T.finish);
  check(/короткая/.test(analyze({ blocks: short }).errors[0]), 'слишком короткая показывается');
}

/* примеры: проходимы, боты не пролетают преграды, ветки совпадают в общей части */
for (const d of EXAMPLES) {
  const a = analyze(d), course = buildCourse(d);
  check(a.ok && a.used.size === d.blocks.size, `${trackName(d)}: ${d.blocks.size} блоков, все в трассе, путей ${a.routes.length} (${a.errors})`);
  if (!course) continue;
  for (const tr of course.routes) if (!tr.pos.every(Number.isFinite) || !tr.up.every(Number.isFinite)) check(false, 'ось без NaN');
  // преграды одной ветки совпадают с другой в мировых координатах
  let worst = 0;
  const seen = new Map();
  for (const tr of course.routes) for (const o of tr.obstacles) {
    if (o.x === undefined) continue;
    const i = Math.floor(o.s / 2) * 3, p = [0, 1, 2].map((c) => tr.pos[i + c] + tr.right[i + c] * o.x + tr.up[i + c] * o.y);
    const was = seen.get(o.key);
    if (was) worst = Math.max(worst, Math.hypot(p[0] - was[0], p[1] - was[1], p[2] - was[2])); else seen.set(o.key, p);
  }
  check(worst < 3, `преграда на всех путях в одном месте (расхождение ${worst.toFixed(1)})`);
  const taken = new Set();
  const skills = DIFFS[d.d].bots.map(([miss, vmaxK, sloppy], i) => ({ miss, vmaxK, sloppy, seed: i + 3 }));
  skills.push({ miss: 0, vmaxK: 1, sloppy: 1, seed: 1 }, { miss: 0.6, vmaxK: 0.8, sloppy: 0.2, seed: 4 }, { miss: 0.3, vmaxK: 0.9, sloppy: 0.5, seed: 8 });
  for (const sk of skills) {
    const p = newRacer(sk.seed & 3), inp = { x: 0, y: 0, brake: false };
    let t = 0, through = 0, hit = 0;
    while (!p.fin && t < 600) {
      botInput(p, course, t, sk, inp);
      const was = p.next, wasTr = routeOf(course, p);
      for (const [e] of stepRacer(p, inp, course, t, DT, sk.vmaxK)) if (e === 'hit') hit++;
      const tr = routeOf(course, p);
      for (let i = was; i < p.next; i++) if (tr.obstacles[i].kind !== 'boost' && hits(tr.obstacles[i], p.x, p.y, t)) through++;
      if (wasTr !== tr && p.s > tr.length) through++;
      t += DT;
    }
    taken.add(p.route || 0);
    check(p.fin > 0 && through === 0, `бот (ошибается ${sk.miss}): ${p.fin ? p.fin.toFixed(1) + ' с' : 'НЕ ДОЛЕТЕЛ'}, ударов ${hit}, сквозь преграды ${through}, путь ${p.route || 0}`);
  }
  if (course.routes.length > 1) check(taken.size > 1, `боты разъехались по разным веткам: ${[...taken].join(', ')}`);
}

/* игрок выбирает ветку рулём */
{
  const course = buildCourse(EXAMPLES[1]);
  const pos = (route) => course.routes[route].forks[0];
  const f = pos(0);
  const results = f.opts.map((q) => {
    const p = { ...newRacer(0), s: f.s - 1, x: 0, y: 0, v: 40, next: 0 };
    stepRacer(p, { x: Math.sign(q.dx) * (Math.abs(q.dx) > 1 ? 1 : 0), y: Math.sign(q.dy) * (Math.abs(q.dy) > 1 ? 1 : 0), brake: false }, course, 0, DT);
    return [p.route || 0, q.route];
  });
  const lateral = f.opts.filter((q) => Math.hypot(q.dx, q.dy) > 1);
  check(lateral.length > 0 && results.filter(([got, want]) => got === want).length >= lateral.length, `руль выбирает ветку: ${JSON.stringify(results)}`);
}
console.log(fails ? `\nошибок: ${fails}` : '\nошибок: 0');
process.exit(fails ? 1 : 0);
