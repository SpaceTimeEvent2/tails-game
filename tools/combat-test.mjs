#!/usr/bin/env node
/** Проверка правил без графики: бой персонажа, командная игра, свои уровни. Запуск: node tools/combat-test.mjs */
import { Sim, HERO, IDLE_AFTER, waveInfo } from '../src/sim.js';
import { teamMult } from '../src/balance.js';
import { toLevel, encode, decode, sampleDesign, GHOSTS } from '../src/custom.js';
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? '  ok ' : 'FAIL '} ${what}`); if (!ok) fails++; };
const level = () => toLevel(sampleDesign());
const spots = (l) => l.spotsList.map(([x, z]) => [x, z, 1]);
const game = (n = 1) => { const l = level(); return new Sim(l, { players: Array.from({ length: n }, (_, i) => ({ id: i + 1 })), spots: spots(l), rng: () => 0.9 }); };
const run = (s, t) => { for (let i = 0; i < t * 30; i++) s.step(1 / 30); };
const enemyNear = (s, p, hp = 100) => { s.spawn({ hp, speed: 0.001, scale: 1, bounty: 7, big: false }); const e = s.enemies[s.enemies.length - 1]; p.x = e.x + 2; p.z = e.z; return e; };

console.log('удар персонажа');
{
  const s = game(); const p = s.players.get(1);
  check(s.act(1, { k: 'hit' }).ok === false, 'без персонажа на поле удара нет');
  s.act(1, { k: 'pos', x: 0, z: 0, r: 0 });
  check(s.act(1, { k: 'hit' }).err === 'Рядом нет монстра' && p.lives === HERO.lives, 'мимо: жизнь не сгорает');
  const e = enemyNear(s, p, 300);
  s.act(1, { k: 'hit' });
  check(p.lives === HERO.lives - 1, 'удар сжигает жизнь');
  check(Math.round(e.hp) === 198, 'удар отнимает треть здоровья монстра');
  check(s.act(1, { k: 'hit' }).ok === false, 'сразу второй удар нельзя');
  const shells = p.shells;
  e.hp = 1; s.time += 1; p.safeUntil = s.time + 100; const before = p.lives;
  s.act(1, { k: 'hit' }); s.step(1 / 30);
  check(!s.enemies.includes(e), 'монстр убит');
  check(p.shells === shells, 'убийство персонажем не даёт денег');
  check(p.lives === before - 1 + HERO.gain, `даёт жизни: +${HERO.gain}`);
}
{
  const s = game(); const p = s.players.get(1); s.act(1, { k: 'pos', x: 0, z: 0, r: 0 });
  const e = enemyNear(s, p, 300); p.safeUntil = 1e9;
  s.time += 1; s.act(1, { k: 'hit', air: 1 });
  check(Math.round(e.hp) === 147, 'в прыжке бьёт в полтора раза сильнее');
}
console.log('деньги дают только башни');
{
  const s = game(); const p = s.players.get(1); const start = p.shells;
  s.act(1, { k: 'build', s: 0, f: 'mila' });
  const after = p.shells;
  s.spawn({ hp: 1, speed: 0.001, scale: 1, bounty: 7, big: false });
  const e = s.enemies[0]; e.x = s.spots[0].x + 1; e.z = s.spots[0].z;
  e.d = 0; s.paths[0].at = ((orig) => function (d, o = {}) { o.x = s.spots[0].x + 1; o.z = s.spots[0].z; return o; })(s.paths[0].at);
  run(s, 2);
  check(!s.enemies.includes(e) && p.shells === after + 7 && start > after, 'башня убила — ракушки');
}
console.log('монстр бьёт персонажа');
{
  const s = game(); const p = s.players.get(1); s.act(1, { k: 'pos', x: 0, z: 0, r: 0 });
  const e = enemyNear(s, p, 1e6);
  s.step(1 / 30);
  check(p.lives === HERO.lives - 1, 'монстр рядом ударил');
  check(e.stun > 0, 'и на миг остановился');
  p.lives = 1; p.safeUntil = 0; e.hitCool = 0;
  s.step(1 / 30);
  check(p.down && p.lives === 0, 'жизни кончились — персонаж отдыхает');
  check(s.tails === 5, 'домик от этого не страдает');
  check(s.act(1, { k: 'hit' }).ok === false, 'на отдыхе бить нельзя');
  run(s, HERO.downFor + 0.1);
  check(!p.down && p.lives >= 1, 'вернулся с жизнями');
  const bot = game(2); bot.players.get(2).x = 0;
  enemyNear(bot, { x: 0, z: 0 }, 1e6);
  bot.step(1 / 30);
  check(bot.players.get(2).lives === HERO.lives, 'игрока без персонажа (бот, Набережная в одиночку) не бьют');
}
console.log('командная игра');
{
  const s = game(2); const [a, b] = [s.players.get(1), s.players.get(2)];
  s.act(1, { k: 'build', s: 0, f: 'mila' }); s.act(2, { k: 'build', s: 1, f: 'mila' });
  check(s.act(1, { k: 'up', s: 1 }).ok, 'подружку друга можно растить');
  check(s.act(1, { k: 'sell', s: 1 }).ok === false, 'но нельзя отправить домой');
  s.removePlayer(2);
  check(s.act(1, { k: 'sell', s: 1 }).ok, 'подружку ушедшего — можно');
  const l = level(), t = new Sim({ ...l, spotsList: l.spotsList.slice(0, 2) }, { players: [{ id: 1 }, { id: 2 }], spots: spots(l).slice(0, 2) });
  t.players.get(1).shells = 1000;
  t.act(1, { k: 'build', s: 0, f: 'mila' });
  check(t.act(1, { k: 'build', s: 1, f: 'mila' }).err === 'Оставь эту плиту другу!', 'последняя плита придерживается для друга');
  t.time = IDLE_AFTER + 1; t.act(1, { k: 'dance' }); t.startWave(1); t.queue.length = 0;
  check(t.players.get(2).idle && t.workingCount === 1, `не действовал ${IDLE_AFTER} с — считается отошедшим`);
  check(t.act(1, { k: 'build', s: 1, f: 'mila' }).ok, 'отошедшему плита не держится');
  const q = new Sim(l, { players: [{ id: 1 }, { id: 2 }], spots: spots(l) });
  q.time = IDLE_AFTER + 1; q.act(1, { k: 'dance' }); const bs = q.players.get(2).shells, as = q.players.get(1).shells;
  q.startWave(1);
  check(q.queue.length === waveInfo(1, l, teamMult(1)).count, 'волна рассчитана на тех, кто играет');
  check(q.players.get(2).shells < bs && q.players.get(1).shells > as, 'половина ракушек отошедшего — команде');
  q.act(2, { k: 'dance' });
  check(!q.players.get(2).idle, 'вернулся — снова в команде');
  const snap = q.snapshot(), r = Sim.fromSnapshot(l, spots(l), JSON.parse(JSON.stringify(snap)), [{ id: 1 }, { id: 2 }]);
  check(r.players.get(1).lives === q.players.get(1).lives, 'жизни переживают смену ведущего');
}
console.log('призрак растёт');
{
  const s = game(); const p = s.players.get(1);
  s.act(1, { k: 'pos', x: 0, z: 0, r: 0 });
  check(s.act(1, { k: 'grow' }).ok === false, 'другой персонаж не растёт');
  s.act(1, { k: 'pos', x: 0, z: 0, r: 0, g: 1 });
  p.shells = 59;
  check(s.act(1, { k: 'grow' }).err === 'не хватает ракушек', 'рост стоит ракушек');
  p.shells = 1000;
  for (const c of HERO.growCost) { const b = p.shells; s.act(1, { k: 'grow' }); check(b - p.shells === c, `стадия ${p.grow} за ${c}`); }
  check(p.grow === 4 && s.act(1, { k: 'grow' }).ok === false, 'четыре стадии, как у замка');
  const e = enemyNear(s, p, 300); p.safeUntil = 1e9; s.time += 1;
  s.act(1, { k: 'hit' });
  check(Math.round(300 - e.hp) === Math.round(300 * HERO.hit * (1 + HERO.growHit * 3)), 'большой призрак бьёт сильнее');
  const r = Sim.fromSnapshot(s.level, spots(s.level), JSON.parse(JSON.stringify(s.snapshot())), [{ id: 1 }]);
  check(r.players.get(1).grow === 4 && r.players.get(1).ghostHero, 'рост переживает смену ведущего');
}
console.log('свой уровень');
{
  const d = { ...sampleDesign(), friends: ['castle', 'iva'], ghosts: 'all' };
  const x = decode(encode(d));
  check(x.friends.join() === 'castle,iva' && x.ghosts === 'all', 'защитники и привидения сохраняются в коде');
  const L = toLevel(x);
  check(L.friends.includes('castle') && L.ghosts === 1, 'в игре можно строить замок, привидения включены');
  check(toLevel(sampleDesign()).friends.includes('castle'), 'новый уровень сразу с замком');
  check(toLevel({ ...sampleDesign(), ghosts: 'none' }).ghosts === 0, 'привидения можно выключить');
  check(new Sim(toLevel({ ...d, ghosts: 'all' }), { players: [{ id: 1 }], spots: [[0, 0, 1]], rng: () => 0.99 }).ghostChance === GHOSTS.all.chance, 'только привидения');
  const old = Buffer.from(JSON.stringify({ v: 1, n: 'Старый', c: '195.', t: 8, d: 'easy', th: 'castle' })).toString('base64');
  const oldD = decode(old);
  check(oldD && !oldD.friends.length, 'старые коды читаются');
}
console.log(`\nошибок: ${fails}`);
process.exit(fails ? 1 : 0);
