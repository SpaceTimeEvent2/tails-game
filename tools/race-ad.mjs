#!/usr/bin/env node
/**
 * Вертикальный ролик о гонке для YouTube Shorts: настоящая игра по кадрам в виртуальном времени, звук теми же функциями, что в игре.
 * Сервер: PORT=8795 node server/index.js. Запуск: node tools/race-ad.mjs файл.mp4 концовка.png [ширина=1080]
 * В кадре только Маскот и Призрак: модель Tiny Dancer в рекламу не берём (docs/CONTENT_AUDIT.md).
 */
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [OUT = 'store/video/tails-race-shorts.mp4', CARD, WIDTH = '1080'] = process.argv.slice(2);
const W = Number(WIDTH), H = Math.round((W * 16) / 9), FPS = 30, BEAT = 60 / 124, Z = (W / 460).toFixed(3);
const BASE = process.env.BASE || 'http://127.0.0.1:8795';
const SILENT = path.join(os.tmpdir(), `tails-race-ad-${process.pid}.mp4`);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', SILENT], { stdio: ['pipe', 'inherit', 'inherit'] });
const write = (b) => new Promise((r) => (ff.stdin.write(b) ? r() : ff.stdin.once('drain', r)));

const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await br.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.evaluateOnNewDocument((profile, Z) => {
  localStorage.setItem('tg.me', JSON.stringify(profile));
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
    st.textContent = `#joy,#brake-zone,#toast,#btn-home,#btn-voice,#clock,#ov-buttons{display:none!important}
      #race-hud{zoom:${Z};top:calc(10vh / ${Z});left:calc(6vw / ${Z});right:calc(6vw / ${Z})}
      #speed{zoom:${Z};bottom:auto;top:calc(72vh / ${Z});left:calc(50vw / ${Z})}
      #drift-chip{zoom:${Z};bottom:auto;top:calc(67vh / ${Z});left:calc(50vw / ${Z})}
      #count{display:none!important}
      #overlay{zoom:${(Z * 1.45).toFixed(3)}}
      #ov-table{min-width:0;width:calc(88vw / ${(Z * 1.45).toFixed(3)})}
      #__cap{position:fixed;left:50%;top:17vh;transform:translateX(-50%);z-index:99;width:92vw;text-align:center;pointer-events:none;
        font:900 11.5vw/1.06 "Segoe UI",system-ui,sans-serif;color:#fff;-webkit-text-stroke:.5vw #0b0d2c;paint-order:stroke fill;text-shadow:0 .9vw 0 #0b0d2c,0 1.8vw 5vw #000c}
      #__cap b{color:#ffd447}#__cap:empty{display:none}#__cap.pop{animation:capPop .22s cubic-bezier(.2,1.7,.4,1)}
      @keyframes capPop{from{transform:translateX(-50%) scale(.45)}}
      #__flash{position:fixed;inset:0;z-index:30;pointer-events:none;background:#fff;opacity:0;transition:opacity .35s}`;
    document.head.append(st);
    document.body.insertAdjacentHTML('beforeend', '<div id="__flash"></div><div id="__cap"></div>');
  });
}, { name: 'Алиса', color: '#ffd447', emoji: '🦊', hero: 'maskot', tint: '#8fd0ff' }, Z);

let total = 0;
const sfxLog = [], musicAt = [], voices = [];
const now = () => total / FPS;
const cap = (t) => page.evaluate((t) => { const e = document.getElementById('__cap'); e.innerHTML = t; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }, t);
const voice = (k) => voices.push([k, now()]);
const music = (lv) => musicAt.push([now(), lv]);
const drain = () => page.evaluate(() => { const a = __audio.log || []; __audio.log = []; return a.map((x) => [x[1], x[2]]); });

/** beats долей: перед каждым кадром each(доля 0..1); slow < 1 — замедление. */
async function rec(beats, each, slow = 1) {
  const n = Math.round(beats * BEAT * FPS);
  for (let i = 0; i < n; i++) {
    if (each) await each(i / n);
    const passed = await page.evaluate((ms) => { const n0 = __race.mine.p.next; __vt.frame(ms); __tickAd(); const n1 = __race.mine.p.next; return n1 > n0 && n1 < 1e5 && n1 - n0 < 3; }, (1000 / FPS) * slow);
    if (passed) sfxLog.push([now(), 'jump', 1]);        // свист пролёта сквозь преграду
    for (const [name, k] of await drain()) if (name !== 'music') sfxLog.push([now(), name, k]);
    const frame = await page.screenshot({ type: 'jpeg', quality: 92 });
    await write(frame);
    total++;
    if (process.env.STOP && total === Number(process.env.STOP)) { fs.writeFileSync(`${OUT}.jpg`, frame); await br.close(); process.exit(0); }
  }
  console.log(`  ${now().toFixed(1)} с`);
}

await page.goto(`${BASE}/race.html?level=3&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__race && document.getElementById('loading').classList.contains('done'), { timeout: 180000 });
await page.evaluate(async () => {
  window.__audio = (await import('/src/audio.js')).audio;
  window.__sim = await import('/src/race-sim.js');
  __audio.log = [];
  __vt.start();
  for (let i = 0; i < 140; i++) __vt.frame(33);      // обратный отсчёт в ролик не идёт
  __audio.log = [];
  const R = __race, m = R.mine.p, obs = R.track.obstacles;
  const nextIdx = (s) => { const i = obs.findIndex((o) => o.s > s); return i < 0 ? obs.length : i; };
  window.__tp = (s, v, x = 0, y = 0) => { Object.assign(m, { s, v, x, y, vx: 0, vy: 0, next: nextIdx(s), safe: 0, stun: 0 }); };
  const bots = [...R.riders.values()].filter((r) => r.skill);
  for (const b of bots) Object.assign(b.skill, { miss: 0, sloppy: 1 });
  window.__bots = (ds, vk) => bots.forEach((b, i) => { b.skill.vmaxK = vk; Object.assign(b.p, { s: m.s + ds[i], v: m.v * vk, vx: 0, vy: 0, x: [5, -5, 0][i], y: [-3, -2, 5][i], next: nextIdx(m.s + ds[i]), safe: 9 }); });
  window.__far = () => bots.forEach((b) => { b.skill.vmaxK = 0.1; Object.assign(b.p, { s: 40, v: 0, next: 0 }); });
  const out = { x: 0, y: 0, brake: false }, skill = { miss: 0, vmaxK: 1, sloppy: 1, seed: 1 };
  window.__mode = 'pilot';
  window.__tickAd = () => {
    if (__mode === 'pilot' && !m.fin) { __sim.botInput(m, R.track, R.raceT, skill, out); R.joy.active = true; R.joy.x = out.x; R.joy.y = out.y; }
    else { R.joy.active = false; R.joy.x = R.joy.y = 0; }
  };
  window.__first = (kind, after) => obs.find((o) => o.kind === kind && o.s > after) || obs.filter((o) => o.kind === kind).pop() || obs.find((o) => o.s > after);
  // самый крутой вираж, перед которым много свободного места
  window.__bendSpot = () => {
    let best = 600, bv = 0;
    for (let s = 400; s < R.track.length - 500; s += 4) {
      const i = Math.floor(s / 2), k = Math.hypot(R.track.bend[i * 2], R.track.bend[i * 2 + 1]);
      const a = obs.find((o) => o.s > s - 120);
      if (k > bv && a && a.s > s + 60) { bv = k; best = s; }
    }
    return best;
  };
  // камера снаружи тоннеля: облёт вокруг персонажа
  window.__orbit = (dist, ang, lift = 6, ahead = 0) => {
    const T = __sim.sample;
    window.__raceCam = (cam) => {
      const a = T(R.track, m.s + ahead, R.track.pos, [0, 0, 0]), r = T(R.track, m.s + ahead, R.track.right, [0, 0, 0]), u = T(R.track, m.s + ahead, R.track.up, [0, 0, 0]), t = T(R.track, m.s + ahead, R.track.tan, [0, 0, 0]);
      const c = Math.cos(ang) * dist, f = Math.sin(ang) * dist;
      cam.position.set(a[0] + r[0] * (c + m.x) + u[0] * (lift + m.y) + t[0] * f, a[1] + r[1] * (c + m.x) + u[1] * (lift + m.y) + t[1] * f, a[2] + r[2] * (c + m.x) + u[2] * (lift + m.y) + t[2] * f);
      cam.up.set(u[0], u[1], u[2]);
      cam.lookAt(a[0] + r[0] * m.x + u[0] * m.y, a[1] + r[1] * m.x + u[1] * m.y, a[2] + r[2] * m.x + u[2] * m.y);
      cam.fov = 58; cam.updateProjectionMatrix();
    };
  };
  window.__chase = () => { window.__raceCam = null; };
  window.__flashNow = () => { const f = document.getElementById('__flash'); f.style.transition = 'none'; f.style.opacity = 0.9; void f.offsetWidth; f.style.transition = ''; f.style.opacity = 0; };
});

/* 1. Сразу в полёт */
await page.evaluate(() => { __far(); const g = __first('gate', 700); __tp(g.s - 150, 96, g.x * 0.6, g.y * 0.6); __bots([10, 22, 34], 0.98); });
music(1);
await cap('ЛЕТИ КАК<br><b>САМОЛЁТ!</b>'); voice('r1');
await rec(5);

/* 2. Вид снаружи: витой тоннель и космос */
await cap('КОСМИЧЕСКИЙ<br><b>ТОННЕЛЬ!</b>'); voice('r2');
await page.evaluate(() => { __far(); __tp(__first('rocks', 1200).s + 40, 80); });
await rec(6, (t) => page.evaluate((t) => __orbit(30 - t * 12, 2.4 + t * 1.6, 8), t));

/* 3. Разгон: скорость растёт на глазах */
await page.evaluate(() => { __chase(); __tp(__first('gate', 1600).s + 10, 28); });
await cap('<b>РАЗГОНЯЙСЯ!</b>'); voice('r3');
await rec(5, (t) => page.evaluate((t) => { __race.mine.p.v = 28 + (100 - 28) * t * t; }, t));

/* 4. Занос: руль отпущен на самом крутом вираже */
await page.evaluate(() => { const s = __bendSpot(); __tp(s - 110, 100); __race.mine.p.safe = 99; __race.mine.p.next = 1e6; __mode = 'free'; });
await cap('ЧЕМ БЫСТРЕЕ,<br>ТЕМ СИЛЬНЕЕ<br><b>ЗАНОСИТ!</b>'); voice('r4');
await rec(7, (t) => page.evaluate((t) => { __race.mine.p.v = Math.max(__race.mine.p.v, 100); }, t));
await page.evaluate(() => { __mode = 'pilot'; });

/* 5. Преграды: быстрая нарезка */
await page.evaluate(() => { const g = __first('gate', 2300); __tp(g.s - 85, 92, g.x, g.y); });
await cap('НЫРЯЙ<br><b>В ПРОХОД!</b>'); voice('r5');
await rec(3);
await page.evaluate(() => { const g = __first('half', 2300) || __first('gate', 2600); __tp(g.s - 85, 92, -Math.cos(g.a || 0) * 6, -Math.sin(g.a || 0) * 6); });
await rec(2);
await page.evaluate(() => { const g = __first('rocks', 2500); __tp(g.s - 85, 92); });
await rec(2);
await page.evaluate(() => { const g = __first('bar', 2500); __tp(g.s - 95, 90); });
await cap('БАЛКИ<br><b>КРУТЯТСЯ!</b>'); voice('r6');
await rec(5);

/* 6. Удар: замедление */
await page.evaluate(() => { const g = __first('gate', 3000); const ox = g.x > 0 ? -1 : 1; __tp(g.s - 28, 95, g.x + ox * (g.hole + 2.2), g.y); __mode = 'free'; });
await cap('');
await rec(1.5, null, 0.5);
await cap('<b>ОЙ!</b>'); voice('r7');
await rec(3, null, 0.45);
await page.evaluate(() => { __mode = 'pilot'; });

/* 7. Кольцо-ускоритель */
await page.evaluate(() => { const g = __first('boost', 2000); __tp(g.s - 90, 80, g.x, g.y); __race.mine.p.next = __race.track.obstacles.indexOf(g); __mode = 'free'; });
await cap('');
await rec(2);
await page.evaluate(() => { __mode = 'pilot'; __race.mine.p.safe = 3; });
await cap('<b>УСКОРЕНИЕ!</b>'); voice('r8');
music(2);
await rec(4);

/* 8. Обгон */
await page.evaluate(() => { const g = __first('gate', 3300); __tp(g.s - 160, 112); __bots([26, 40, 54], 0.72); });
await cap('ОБГОНЯЙ<br><b>ВСЕХ!</b>'); voice('r9');
await rec(7);

/* 9. Все вместе: облёт четверых */
await page.evaluate(() => { __tp(__first('rocks', 3400).s + 30, 85); __bots([-5, 5, 9], 1); __orbit(28, 0.5, 2); });
await cap('С ДРУЗЬЯМИ,<br><b>ДО ЧЕТЫРЁХ!</b>'); voice('r10');
await rec(6, (t) => page.evaluate((t) => __orbit(28 + t * 6, 0.6 + t * 1.5, 2), t));

/* 10. Финиш у чёрной дыры */
await page.evaluate(() => { __chase(); __far(); const R = __race, L = R.track.length; __tp(L - 200, 100); __bots([-30, -55, -80], 0.8); });
await cap('');
await rec(4);
await page.evaluate(() => { const m = __race.mine.p; if (!m.fin) m.s = Math.max(m.s, __race.track.length - 3); __flashNow(); });
music(1);
await rec(2);
await cap(''); voice('r11');
await rec(2);

/* 11. Концовка с кодом и ссылкой */
const end = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', CARD, '-vf', `scale=${W}:${H}:flags=lanczos`, '-q:v', '2', '-f', 'mjpeg', '-'], { maxBuffer: 1 << 27 });
voice('r12');
for (let i = 0; i < 6 * FPS; i++) { await write(end); total++; }
ff.stdin.end();
await new Promise((r) => ff.on('close', r));

/* ── звук ── */
const dur = total / FPS;
const raw = await page.evaluate(async (dur, sfxLog, musicAt) => {
  const { renderSfx, renderBar, BAR } = await import('/src/audio.js');
  const c = new OfflineAudioContext(2, Math.ceil(dur * 44100), 44100);
  const mus = c.createGain(); mus.gain.value = 0.5; mus.connect(c.destination);
  const fx = c.createGain(); fx.gain.value = 0.85; fx.connect(c.destination);
  const lv = (t) => { let l = 1; for (const [at, v] of musicAt) if (at <= t + 0.01) l = v; return l; };
  for (let b = 0, t = 0; t < dur; b++, t += BAR) if (lv(t) >= 0) renderBar(c, mus, t, b, lv(t));
  for (const [t, name, k] of sfxLog) renderSfx(c, name, t, fx, k);
  const b = await c.startRendering();
  const L = b.getChannelData(0), Rr = b.getChannelData(1), out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { out[i * 2] = L[i]; out[i * 2 + 1] = Rr[i]; }
  let s = ''; const u = new Uint8Array(out.buffer); const step = 0x8000;
  for (let i = 0; i < u.length; i += step) s += String.fromCharCode.apply(null, u.subarray(i, i + step));
  return btoa(s);
}, dur, sfxLog, musicAt);
await br.close();
const bedF = path.join(os.tmpdir(), `tails-race-bed-${process.pid}.raw`);
fs.writeFileSync(bedF, Buffer.from(raw, 'base64'));
const inputs = voices.flatMap(([k]) => ['-i', `store/video/race/${k}.mp3`]);
const delays = voices.map(([, at], i) => `[${i + 2}:a]adelay=${Math.round(at * 1000)}:all=1,volume=1.5[v${i}]`).join(';');
const fc = `${delays};${voices.map((_, i) => `[v${i}]`).join('')}amix=inputs=${voices.length}:normalize=0:dropout_transition=0,apad=whole_dur=${dur.toFixed(2)},asplit[vo][key];`
  + `[1:a][key]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=300[bed];[bed][vo]amix=inputs=2:normalize=0:dropout_transition=0,loudnorm=I=-14:TP=-1:LRA=11,afade=t=out:st=${(dur - 0.6).toFixed(2)}:d=0.6,apad[a]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', SILENT, '-f', 'f32le', '-ar', '44100', '-ac', '2', '-i', bedF, ...inputs,
  '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT]);
fs.unlinkSync(SILENT); fs.unlinkSync(bedF);
console.log(`готово: ${OUT}, ${dur.toFixed(1)} с, звуков ${sfxLog.length}`, errs.length ? errs.slice(0, 3) : 'без ошибок');
