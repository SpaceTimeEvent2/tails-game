#!/usr/bin/env node
/**
 * Рекламный ролик на 30 секунд: монтаж в долях такта музыки, настоящая игра, звук отрендерен теми же функциями, что играют в игре.
 * Сервер: PORT=8795 node server/index.js. Запуск: node tools/ad-video.mjs land|vert файл.mp4 концовка.png
 */
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [FORMAT = 'land', OUT = 'store/video/tails-ad.mp4', CARD] = process.argv.slice(2);
const VERT = FORMAT === 'vert';
const W = VERT ? 720 : 1280, H = VERT ? 1280 : 720, FPS = 25, BEAT = 60 / 124;
const BASE = 'http://127.0.0.1:8795';
const SILENT = path.join(os.tmpdir(), `tails-ad-${process.pid}.mp4`);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', SILENT], { stdio: ['pipe', 'inherit', 'inherit'] });
const write = (b) => new Promise((r) => (ff.stdin.write(b) ? r() : ff.stdin.once('drain', r)));

const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await br.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.evaluateOnNewDocument((profile, vert) => {
  localStorage.setItem('tg.me', JSON.stringify(profile));
  localStorage.setItem('tails.voice', 'off');
  const real = { now: performance.now.bind(performance), raf: requestAnimationFrame.bind(window), st: setTimeout.bind(window) };
  let on = false, vt = 0, raf = [], timers = [], id = 1;
  performance.now = () => (on ? vt : real.now());
  window.requestAnimationFrame = (f) => { if (!on) return real.raf(f); raf.push(f); return id++; };
  window.setTimeout = (f, ms = 0, ...a) => { if (!on) return real.st(f, ms, ...a); const t = { id: id++, at: vt + ms, f, a }; timers.push(t); return t.id; };
  const oc = clearTimeout.bind(window);
  window.clearTimeout = (x) => { timers = timers.filter((t) => t.id !== x); oc(x); };
  window.__vt = {
    start() { vt = real.now(); on = true; },
    frame(ms) {
      vt += ms;
      const due = timers.filter((t) => t.at <= vt); timers = timers.filter((t) => t.at > vt);
      for (const t of due) t.f(...t.a);
      const q = raf; raf = [];
      for (const f of q) f(vt);
    },
  };
  addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = `#big-buttons,#joy,#spin,#hud .hud-right,#hud .hud-center,#toast,#build{display:none!important}
      #__cap{position:fixed;left:50%;bottom:${vert ? '16%' : '9%'};transform:translateX(-50%);z-index:99;width:max-content;max-width:92vw;pointer-events:none;text-align:center;
        font:900 ${vert ? 66 : 62}px/1.05 "Segoe UI",system-ui,sans-serif;color:#fff;letter-spacing:.01em;
        -webkit-text-stroke:3px #06192b;paint-order:stroke fill;text-shadow:0 6px 0 #06192b,0 12px 30px #04121ecc}
      #__cap b{color:#ffd447}#__cap:empty{display:none}#__cap.pop{animation:capPop .24s cubic-bezier(.2,1.7,.4,1)}
      @keyframes capPop{from{transform:translateX(-50%) scale(.45)}}
      #__tense{position:fixed;inset:0;z-index:8;pointer-events:none;box-shadow:inset 0 0 ${vert ? 160 : 190}px 70px #c0102acc;opacity:0;transition:opacity .25s}
      #__flash{position:fixed;inset:0;z-index:9;pointer-events:none;background:#fff;opacity:0}
      #combo{font-size:${vert ? 46 : 38}px!important;top:${vert ? '120px' : '84px'}!important;padding:8px 26px!important}
      #hop{font-size:${vert ? 44 : 34}px!important;top:${vert ? '120px' : '84px'}!important;padding:6px 22px!important}`;
    document.head.append(st);
    document.body.insertAdjacentHTML('beforeend', '<div id="__tense"></div><div id="__flash"></div><div id="__cap"></div>');
  });
}, { name: 'Алиса', color: '#ff6f91', emoji: '🦊', hero: 'maskot', tint: '#8fd0ff' }, VERT);

let total = 0;
const sfxLog = [];
const musicAt = [];        // [секунда, уровень музыки; -1 — тишина]
const voices = [];
const now = () => total / FPS;
const shot = () => page.screenshot({ type: 'jpeg', quality: 90 });
const cap = (t) => page.evaluate((t) => { const e = document.getElementById('__cap'); e.innerHTML = t; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }, t);
const voice = (k) => voices.push([k, now()]);
const music = (lv) => musicAt.push([now(), lv]);
const drain = () => page.evaluate(() => { const a = __td.audio.log || []; __td.audio.log = []; return a.map((x) => [x[1], x[2]]); });

/** beats долей: каждый кадр вызывает each(i, доля 0..1); slow < 1 — замедление. */
async function rec(beats, each, slow = 1) {
  const n = Math.round((beats * BEAT) * FPS);
  for (let i = 0; i < n; i++) {
    if (each) await each(i, i / n);
    await page.evaluate((ms) => { __vt.frame(ms); __keep(); }, (1000 / FPS) * slow);
    for (const [name, k] of await drain()) if (name !== 'music') sfxLog.push([now(), name, k]);
    await write(await shot());
    total++;
  }
  console.log(`  ${(total / FPS).toFixed(1)} с`);
}
/** Монтажный пропуск времени: игра идёт, в ролик не пишется. */
async function skip(sec, each) {
  for (let i = 0; i < sec * 25; i++) {
    if (each) await each();
    await page.evaluate(() => { __vt.frame(40); __keep(); });
  }
  await drain();
}

await page.goto(`${BASE}/play.html?map=castle&level=3&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('loading').classList.contains('done') && window.__td && window.__td.runner, { timeout: 120000 });
await page.evaluate(() => {
  __vt.start();
  __td.audio.log = [];
  document.getElementById('btn-cam').click();         // камера ролика — своя
  const s = __td.sim, me = s.players.get(1);
  me.shells = 99999;
  window.__keep = () => { s.tails = 5; me.shells = Math.max(me.shells, 5000); };
  window.__cam = (x, z, dist, az, pol = 0.95) => {
    const { camera, controls } = __td;
    controls.target.set(x, 1.5, z);
    camera.position.set(x + Math.sin(az) * Math.sin(pol) * dist, 1.5 + Math.cos(pol) * dist, z + Math.cos(az) * Math.sin(pol) * dist);
    controls.minDistance = 2;
  };
  window.__front = () => s.enemies.slice().sort((a, b) => a.rem - b.rem)[0];
  window.__farSpots = () => s.spots.map((p, i) => i).filter((i) => !s.towers.has(i));
  window.__nearSpot = (x, z) => s.spots.map((p, i) => [Math.hypot(p.x - x, p.z - z), i]).filter((v) => !s.towers.has(v[1])).sort((a, b) => a[0] - b[0])[0][1];
  window.__wave = (n) => { s.queue = []; s.running = false; s.wave = n - 1; s.over = false; s.startWave(1); };
  window.__weak = (k) => { for (const e of s.enemies) e.hp = Math.min(e.hp, e.maxHp * k); };
});

/* 1. Сразу действие */
await page.evaluate(() => __wave(9));
await skip(11);
await page.evaluate(() => { const h = __td.house.position; __cam(h.x, h.z, 30, 2.4); });
music(1);
await cap('ОНИ УЖЕ<br><b>У ДОМИКА!</b>'); voice('a1');
await rec(4, (i, t) => page.evaluate((t) => { const e = __front(); if (e) { __td.camera.position.lerp(__td.camera.position.clone().sub(__td.controls.target).setLength(26 - t * 12).add(__td.controls.target), 1); __cam(e.x, e.z, 26 - t * 10, 2.4 + t * 0.4, 1.05); } }, t));

/* 2–3. Строй и расти: замок растёт на каждую долю */
const castle = await page.evaluate(() => { const e = __front(), i = __nearSpot(e ? e.x : 0, e ? e.z : 0); __td.doAct({ k: 'build', s: i, f: 'castle' }); const p = __td.sim.spots[i]; return [i, p.x, p.z]; });
await cap('СТРОЙ <b>ЗАМКИ!</b>'); voice('a2');
await rec(2, (i, t) => page.evaluate(([x, z], t) => __cam(x, z, 15 - t * 2, 0.7 + t * 0.3, 1.1), castle.slice(1), t));
await cap('РАСТИ ДО <b>КРЕПОСТИ!</b>');
for (let k = 0; k < 4; k++) {
  await page.evaluate((s) => __td.doAct({ k: 'up', s }), castle[0]);
  await rec(1, (i, t) => page.evaluate(([x, z], k, t) => __cam(x, z, 15 + k * 1.2 - t, 1 + k * 0.55, 1.15), castle.slice(1), k, t));
}

/* 4. Башни работают: ракушки */
await page.evaluate(() => { const s = __td.sim; for (let n = 0; n < 5; n++) { const free = __farSpots(); if (free.length) __td.doAct({ k: 'build', s: free[n % free.length], f: 'castle' }); } __wave(10); });
await skip(5, () => page.evaluate(() => __weak(0.12)));
await cap('БАШНИ ПРИНОСЯТ<br><b>РАКУШКИ 🐚</b>'); voice('a3');
await rec(5, (i, t) => page.evaluate((t) => { __weak(0.1); const e = __front(); if (e) __cam(e.x, e.z, 24, 0.5 + t, 0.95); }, t));

/* 5. Распрыжка */
music(1);
const hopStep = (a) => page.evaluate((a) => {
  const { runner: r, joy, controls, camera } = __td;
  const tx = Math.cos(a) * 24, tz = Math.sin(a) * 24;
  const dx = tx - r.root.position.x, dz = tz - r.root.position.z, l = Math.hypot(dx, dz) || 1;
  const fx = controls.target.x - camera.position.x, fz = controls.target.z - camera.position.z, fl = Math.hypot(fx, fz) || 1;
  joy.active = true; joy.x = (dx / l) * (-fz / fl) + (dz / l) * (fx / fl); joy.y = (dx / l) * (fx / fl) + (dz / l) * (fz / fl);
  if (!r.air || r.vy < -6) r.jump();
  const v = Math.atan2(r.vx, r.vz);
  __cam(r.root.position.x, r.root.position.z, 15, v + Math.PI, 1.2);
}, a);
let ang = 0;
await skip(2.5, () => { ang += 0.04; return hopStep(ang); });
await cap('<b>РАЗГОНЯЙСЯ!</b>'); voice('a4');
await rec(5, () => { ang += 0.04; return hopStep(ang); });

/* 6. Удары и серия */
await page.evaluate(() => { __td.joy.active = false; __td.joy.x = __td.joy.y = 0; const me = __td.sim.players.get(1); me.safeUntil = 1e9; me.lives = 8; __td.sim.towers.clear(); __wave(10); });
await skip(4);
const strike = () => page.evaluate(() => {
  const s = __td.sim, me = s.players.get(1), r = __td.runner, e = __front();
  if (!e) return;
  r.root.position.x = e.x + 2.4; r.root.position.z = e.z + 1.2; me.x = r.root.position.x; me.z = r.root.position.z;
  r.yaw = Math.atan2(-2.4, -1.2); r.root.rotation.y = r.yaw;
  __cam(e.x, e.z, 13, 0.9 + s.time * 0.25, 1.15);
  if (me.hitReady <= s.time) { e.hp = 1; __td.doAct({ k: 'hit', air: 1 }); me.hitReady = s.time + 0.42; }
  if (s.enemies.length < 2 && !s.queue.length) __wave(10);
});
await cap('БЕЙ САМ!'); voice('a5');
await rec(3, strike);
await cap('СЕРИЯ <b>УМНОЖАЕТ<br>ЖИЗНИ!</b>');
await rec(5, strike);

/* 7. Одна жизнь: замедление, музыка стихает */
await page.evaluate(() => {
  const s = __td.sim, me = s.players.get(1);
  s.enemies.length = 0; s.shots.length = 0; __wave(15);
  me.lives = 1; me.combo = 0; document.getElementById('combo').hidden = true;
  s.queue.length = 1;                                  // только большая тень
  document.getElementById('__tense').style.opacity = 1;
});
await skip(1);
await page.evaluate(() => { const s = __td.sim, b = s.enemies.find((e) => e.big) || s.enemies[0]; b.d = Math.max(b.d, 20); s.paths[b.pi].at(b.d, b); __td.floatText; });
music(-1);
await cap('ОДНА ЖИЗНЬ…'); voice('a6');
await rec(4, (i, t) => page.evaluate((t) => {
  const s = __td.sim, b = s.enemies.find((e) => e.big); if (!b) return;
  const { runner: r } = __td, me = s.players.get(1);
  const p = s.paths[b.pi].at(b.d + 7);
  r.root.position.x = p.x; r.root.position.z = p.z; me.x = p.x; me.z = p.z; me.safeUntil = 1e9;
  r.yaw = Math.atan2(b.x - p.x, b.z - p.z); r.root.rotation.y = r.yaw;
  __cam((p.x + b.x) / 2, (p.z + b.z) / 2, 15 - t * 5, r.yaw + 1.3, 1.32);
}, t), 0.3);

/* 8. Развязка: крепости добивают большую тень */
const boss = await page.evaluate(() => {
  document.getElementById('__tense').style.opacity = 0;
  const s = __td.sim, b = s.enemies.find((e) => e.big);
  b.hp = b.maxHp; b.speed *= 0.5;
  const near = s.spots.map((p, i) => [Math.hypot(p.x - b.x, p.z - b.z), i]).sort((x, y) => x[0] - y[0]).slice(0, 4).map((v) => v[1]);
  for (const i of near) { s.towers.delete(i); __td.doAct({ k: 'build', s: i, f: 'castle' }); for (let n = 0; n < 3; n++) __td.doAct({ k: 'up', s: i }); }
  return near.length;
});
console.log('  крепостей', boss);
music(2);
await cap('<b>КРЕПОСТЬ,</b> ОГОНЬ!');
await rec(6, (i, t) => page.evaluate((t) => {
  const s = __td.sim, b = s.enemies.find((e) => e.big);
  if (b) { b.hp = Math.min(b.hp, b.maxHp * (1 - t) + 1); __cam(b.x, b.z, 30 - t * 8, 2 + t * 1.2, 1); }
}, t));
await page.evaluate(() => { const s = __td.sim, b = s.enemies.find((e) => e.big); if (b) { b.hp = 0; b.heroBy = 0; } const f = document.getElementById('__flash'); f.style.opacity = 0.9; f.style.transition = 'opacity .4s'; setTimeout(() => { f.style.opacity = 0; }, 40); });
await cap('<b>ПОБЕДА!</b>'); voice('a7');
await rec(2);

/* 9. Салют и три звезды */
await page.evaluate(() => { const s = __td.sim; s.enemies.length = 0; s.tails = 5; s.finish(true); const h = __td.house.position; __cam(h.x, h.z, 44, 0.8, 1); });
music(1);
await cap('');
await rec(8);

/* 10. С друзьями: четверо у замка */
const castleAt = castle.slice(1);
await page.evaluate(async ([x, z]) => {
  document.getElementById('overlay').classList.remove('show');
  const R = await import('/src/runner.js');
  for (const h of ['dancer', 'ghost']) await R.loadRunnerModel(__td.loader, h);
  const list = [['dancer', '#ffd447', '#ff9dbb', '🐱 Боря'], ['maskot', '#9be37a', '#9be37a', '🐬 Галя'], ['ghost', '#c7b0ff', '#c7b0ff', '🦄 Ваня']];
  const { runner: me } = __td;
  window.__crew = list.map(([hero, color, tint, name]) => new R.Runner(__td.scene, { hero, color, tint, name }));
  window.__crew[2].setGrow(3);
  const spot = [[-5, 3], [5, 3], [0, -6]];
  window.__crew.forEach((r, i) => { r.root.position.set(x + 9 + spot[i][0], 0, z + 9 + spot[i][1]); r.dance(30); });
  me.root.position.set(x + 9, 0, z + 12); me.stop(); me.dance(30);
  window.__crewTick = (dt) => { for (const r of __crew) r.update(dt); };
}, castleAt);
await new Promise((r) => setTimeout(r, 500));
await cap('ЗОВИ <b>ДРУЗЕЙ!</b>'); voice('a8');
await rec(8, (i, t) => page.evaluate(([x, z], t) => { __crewTick(0.04); __cam(x + 9, z + 10, 22 - t * 4, -0.9 + t * 1.4, 1.2); }, castleAt, t));

/* 11. Концовка */
const end = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', CARD, '-q:v', '2', '-f', 'mjpeg', '-'], { maxBuffer: 1 << 26 });
voice('a9');
music(1);
const tail = Math.round((62 * BEAT + 0.6) * FPS);
for (let i = total; i < Math.max(tail, total + 5 * FPS); i++) { await write(end); total++; }
ff.stdin.end();
await new Promise((r) => ff.on('close', r));

/* ── звук: музыка и эффекты теми же функциями, что в игре ── */
const dur = total / FPS;
const raw = await page.evaluate(async (dur, sfxLog, musicAt) => {
  const { renderSfx, renderBar, BAR } = await import('/src/audio.js');
  const c = new OfflineAudioContext(2, Math.ceil(dur * 44100), 44100);
  const mus = c.createGain(); mus.gain.value = 0.5; mus.connect(c.destination);
  const fx = c.createGain(); fx.gain.value = 0.85; fx.connect(c.destination);
  const lv = (t) => { let l = 1; for (const [at, v] of musicAt) if (at <= t + 0.01) l = v; return l; };
  for (let b = 0, t = 0; t < dur; b++, t += BAR) if (lv(t) >= 0) renderBar(c, mus, t, b, lv(t));
  const last = {};
  for (const [t, name, k] of sfxLog) {
    if (name === 'shoot' && t - (last.shoot ?? -1) < 0.14) continue;
    if (name === 'shell' && t - (last.shell ?? -1) < 0.16) continue;
    last[name] = t;
    renderSfx(c, name, t, fx, k);
  }
  const b = await c.startRendering();
  const L = b.getChannelData(0), Rr = b.getChannelData(1), out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { out[i * 2] = L[i]; out[i * 2 + 1] = Rr[i]; }
  let s = ''; const u = new Uint8Array(out.buffer); const step = 0x8000;
  for (let i = 0; i < u.length; i += step) s += String.fromCharCode.apply(null, u.subarray(i, i + step));
  return btoa(s);
}, dur, sfxLog, musicAt);
await br.close();
const bedF = path.join(os.tmpdir(), `tails-bed-${process.pid}.raw`);
fs.writeFileSync(bedF, Buffer.from(raw, 'base64'));
const inputs = voices.flatMap(([k]) => ['-i', `store/video/ad/${k}.mp3`]);
const delays = voices.map(([, at], i) => `[${i + 2}:a]adelay=${Math.round(at * 1000)}:all=1,volume=1.5[v${i}]`).join(';');
const fc = `${delays};${voices.map((_, i) => `[v${i}]`).join('')}amix=inputs=${voices.length}:normalize=0:dropout_transition=0,asplit[vo][key];`
  + `[1:a][key]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=300[bed];[bed][vo]amix=inputs=2:normalize=0:dropout_transition=0,loudnorm=I=-14:TP=-1:LRA=11,aresample=44100[a]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', SILENT, '-f', 'f32le', '-ar', '44100', '-ac', '2', '-i', bedF, ...inputs,
  '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT]);
fs.unlinkSync(SILENT); fs.unlinkSync(bedF);
console.log(`готово: ${OUT}, ${dur.toFixed(1)} с, звуков ${sfxLog.length}`, errs.length ? errs.slice(0, 3) : 'без ошибок');
