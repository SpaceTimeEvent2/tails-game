#!/usr/bin/env node
/**
 * Вертикальный ролик для YouTube Shorts об обновлении 1.7: корабли, стрельба, конструктор трасс, развилки, «Достроить», друзья.
 * Настоящая игра по кадрам в виртуальном времени (как tools/race-ad.mjs). Гонка — на весь кадр; конструктор и профиль —
 * как в приложении, лёжа, в рамке посередине: в книжной ориентации их панели не помещаются, а приложение всегда горизонтальное.
 * Сервер: PORT=8795 node server/index.js. Запуск: node tools/update-ad.mjs файл.mp4 концовка.png [ширина=1080]
 * Голос: store/video/update/*.mp3 (tools/howto-voice.sh из update-raw). Модель Tiny Dancer в кадр не берём (docs/CONTENT_AUDIT.md).
 */
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, encode, analyze, T, keyOf } from '../src/race-design.js';

const [OUT = 'store/video/tails-update-shorts.mp4', CARD = 'store/video/update-card.png', WIDTH = '1080'] = process.argv.slice(2);
const W = Number(WIDTH), H = Math.round((W * 16) / 9), FPS = 30, BEAT = 60 / 124, Z = (W / 460).toFixed(3);
const BASE = process.env.BASE || 'http://127.0.0.1:8795';
const SILENT = path.join(os.tmpdir(), `tails-update-ad-${process.pid}.mp4`);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', SILENT], { stdio: ['pipe', 'inherit', 'inherit'] });
const write = (b) => new Promise((r) => (ff.stdin.write(b) ? r() : ff.stdin.once('drain', r)));

const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await br.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
/* виртуальное время в каждом документе (и во вложенном окне); подписи и стиль ролика — только во внешнем */
await page.evaluateOnNewDocument((profile, Z) => {
  localStorage.setItem('tg.me', JSON.stringify(profile));
  localStorage.setItem('tails.voice', 'on');
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
  if (window !== window.top) return;
  addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = `#joy,#brake-zone,#toast,#btn-home,#btn-voice,#clock,#ov-buttons,#count{display:none!important}
      #race-hud{zoom:${Z};top:calc(10vh / ${Z});left:calc(6vw / ${Z});right:calc(6vw / ${Z})}
      #speed{zoom:${Z};bottom:auto;top:calc(72vh / ${Z});left:calc(50vw / ${Z})}
      #drift-chip{display:none!important}
      #fire{zoom:${Z};bottom:auto;top:calc(78vh / ${Z});right:calc(6vw / ${Z})}
      #__cap{position:fixed;left:50%;top:17vh;transform:translateX(-50%);z-index:99;width:92vw;text-align:center;pointer-events:none;
        font:900 11.5vw/1.06 "Segoe UI",system-ui,sans-serif;color:#fff;-webkit-text-stroke:.5vw #0b0d2c;paint-order:stroke fill;text-shadow:0 .9vw 0 #0b0d2c,0 1.8vw 5vw #000c}
      #__cap b{color:#ffd447}#__cap:empty{display:none}#__cap.pop{animation:capPop .22s cubic-bezier(.2,1.7,.4,1)}
      @keyframes capPop{from{transform:translateX(-50%) scale(.45)}}
      #__flash{position:fixed;inset:0;z-index:30;pointer-events:none;background:#fff;opacity:0;transition:opacity .35s}
      #__tap{position:fixed;z-index:98;width:9vw;height:9vw;margin:-4.5vw 0 0 -4.5vw;border-radius:50%;border:1vw solid #fff;background:#ffd44788;opacity:0;pointer-events:none}
      #__tap.on{animation:tap .5s ease-out}@keyframes tap{from{opacity:1;transform:scale(.4)}to{opacity:0;transform:scale(1.3)}}`;
    document.head.append(st);
    document.body.insertAdjacentHTML('beforeend', '<div id="__flash"></div><div id="__cap"></div><div id="__tap"></div>');
  });
}, { name: 'Алиса', color: '#ffd447', emoji: '🦊', hero: 'maskot', tint: '#8fd0ff', ship: 'wedge' }, Z);

let total = 0, scene = null;              // scene — где идёт время: страница гонки или окно с интерфейсом
const sfxLog = [], musicAt = [], voices = [];
const now = () => total / FPS;
const cap = (t) => page.evaluate((t) => { const e = document.getElementById('__cap'); e.innerHTML = t; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }, t);
const voice = (k) => voices.push([k, now()]);
const music = (lv) => musicAt.push([now(), lv]);

/** beats долей; перед каждым кадром each(доля 0..1); slow < 1 — замедление. */
async function rec(beats, each, slow = 1) {
  const n = Math.round(beats * BEAT * FPS);
  for (let i = 0; i < n; i++) {
    if (each) await each(i / n);
    const sounds = await scene.evaluate((ms) => {
      __vt.frame(ms);
      if (window.__tickAd) __tickAd();
      const a = (window.__audio && __audio.log) || [];
      if (window.__audio) __audio.log = [];
      return a.map((x) => [x[1], x[2]]);
    }, (1000 / FPS) * slow);
    for (const [name, k] of sounds) if (name !== 'music') sfxLog.push([now(), name, k]);
    await write(await page.screenshot({ type: 'jpeg', quality: 92 }));
    total++;
  }
  console.log(`  ${now().toFixed(1)} с`);
}

/* ── гонка на весь кадр ── */
async function openRace(url) {
  await page.goto(`${BASE}/${url}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__race && document.getElementById('loading').classList.contains('done'), { timeout: 180000 });
  scene = page.mainFrame();
  await page.evaluate(async () => {
    window.__audio = (await import('/src/audio.js')).audio;
    window.__sim = await import('/src/race-sim.js');
    __audio.log = [];
    __vt.start();
    for (let i = 0; i < 140; i++) __vt.frame(33);   // обратный отсчёт в ролик не идёт
    __audio.log = [];
    const R = __race, m = R.mine.p;
    const obs = () => R.track.obstacles;
    const nextIdx = (s) => { const i = obs().findIndex((o) => o.s > s); return i < 0 ? obs().length : i; };
    window.__tp = (s, v, x = 0, y = 0) => Object.assign(m, { s, v, x, y, vx: 0, vy: 0, next: nextIdx(s), safe: 0, stun: 0, zap: 0 });
    const bots = [...R.riders.values()].filter((r) => r.skill);
    for (const b of bots) Object.assign(b.skill, { miss: 0, sloppy: 1 });
    window.__bots = (ds, vk, xs = [5, -5, 0], ys = [-3, -2, 5]) => bots.forEach((b, i) => { b.skill.vmaxK = vk; b.aimT = 99;
      Object.assign(b.p, { s: m.s + ds[i], v: m.v * vk, vx: 0, vy: 0, x: xs[i], y: ys[i], next: nextIdx(m.s + ds[i]), safe: 9, zap: 0, route: m.route || 0, nf: m.nf || 0 }); });
    window.__botsList = bots;
    const out = { x: 0, y: 0, brake: false }, skill = { miss: 0, vmaxK: 1, sloppy: 1, seed: 1 };
    window.__mode = 'pilot';
    window.__steer = [0, 0];
    window.__tickAd = () => {
      if (__mode === 'pilot' && !m.fin) { __sim.botInput(m, R.course, R.raceT, skill, out); R.joy.active = true; R.joy.x = out.x; R.joy.y = out.y; }
      else if (__mode === 'steer') { R.joy.active = true; R.joy.x = __steer[0]; R.joy.y = __steer[1]; }
      else { R.joy.active = false; R.joy.x = R.joy.y = 0; }
    };
    window.__first = (kind, after) => obs().find((o) => o.kind === kind && o.s > after) || obs().find((o) => o.s > after);
    window.__clear = (from, len) => { for (const o of obs()) if (o.s > from && o.s < from + len) return false; return true; };
    window.__orbit = (dist, ang, lift = 6) => {
      const S = __sim.sample;
      window.__raceCam = (cam) => {
        const tr = R.track, a = S(tr, m.s, tr.pos, [0, 0, 0]), r = S(tr, m.s, tr.right, [0, 0, 0]), u = S(tr, m.s, tr.up, [0, 0, 0]), t = S(tr, m.s, tr.tan, [0, 0, 0]);
        const c = Math.cos(ang) * dist, f = Math.sin(ang) * dist;
        for (let i = 0; i < 3; i++) cam.position.setComponent(i, a[i] + r[i] * (c + m.x) + u[i] * (lift + m.y) + t[i] * f);
        cam.up.set(u[0], u[1], u[2]);
        cam.lookAt(a[0] + r[0] * m.x + u[0] * m.y, a[1] + r[1] * m.x + u[1] * m.y, a[2] + r[2] * m.x + u[2] * m.y);
        cam.fov = 58; cam.updateProjectionMatrix();
      };
    };
    window.__chase = () => { window.__raceCam = null; };
  });
}

/* ── интерфейс в рамке: приложение лёжа посередине вертикального кадра ── */
const FW = 800, FH = 450, FK = W / FW * 0.96;
async function openFramed(url) {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.evaluate((src, FW, FH, FK) => {
    document.body.className = '';
    document.body.innerHTML = `<div id="__bg"></div><iframe id="__app" src="${src}"></iframe><div id="__flash"></div><div id="__cap"></div><div id="__tap"></div>`;
    const st = document.createElement('style');
    st.textContent = `body{margin:0;overflow:hidden;background:#05061a}
      #__bg{position:fixed;inset:0;background:radial-gradient(circle at 30% 20%,#3b2a8a 0,transparent 45%),radial-gradient(circle at 75% 80%,#0f5a8a 0,transparent 50%),#05061a}
      #__app{position:fixed;left:50%;top:61%;width:${FW}px;height:${FH}px;border:0;border-radius:18px;transform:translate(-50%,-50%) scale(${FK});box-shadow:0 0 0 6px #1b1d3a,0 0 0 9px #ffd447,0 30px 80px #000c;background:#05061a}`;
    document.head.append(st);
  }, `${BASE}/${url}`, FW, FH, FK);
  const handle = await page.waitForSelector('#__app');
  scene = await handle.contentFrame();
  await scene.waitForFunction(() => document.readyState === 'complete', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  await scene.evaluate(() => { __vt.start(); for (let i = 0; i < 10; i++) __vt.frame(33); });
}
/** Нажатие пальцем в окне: кружок на экране ролика, потом клик. */
async function tapIn(sel) {
  const r = await scene.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
  await page.evaluate(([x, y], FW, FH, FK) => {
    const X = innerWidth / 2 + (x - FW / 2) * FK, Y = innerHeight / 2 + (y - FH / 2) * FK, t = document.getElementById('__tap');
    t.style.left = `${X}px`; t.style.top = `${Y}px`; t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
  }, r, FW, FH, FK);
  await scene.evaluate((sel) => document.querySelector(sel).click(), sel);
}

/* 1. Сразу в гонку: корабли летят строем */
await openRace('race.html?level=2&debug');
await page.evaluate(() => { const g = __first('gate', 600); __tp(g.s - 170, 80, g.x * 0.5, g.y * 0.5); __bots([12, 22, 32], 0.97); });
music(1);
await cap('БОЛЬШОЕ<br><b>ОБНОВЛЕНИЕ!</b>'); voice('u1');
await rec(6);

/* 2. Вид снаружи: у каждого свой корабль */
await page.evaluate(() => { const s = __first('rocks', 1100).s + 40; __tp(s, 70); __bots([-6, 6, 10], 1, [7, -7, 0], [0, 1, -6]); __orbit(26, 0.4, 3); });
await cap('СВОЙ<br><b>КОРАБЛЬ!</b>'); voice('u2');
await rec(7, (t) => page.evaluate((t) => __orbit(26 + t * 6, 0.4 + t * 1.9, 3), t));

/* 3. Профиль: выбираем форму */
await openFramed('profile.html');
await cap('КЛИН, СТРЕЛА<br><b>ИЛИ ДЕЛЬТА</b>'); voice('u3');
await rec(2);
for (const i of [1, 2, 0]) { await tapIn(`#ships button:nth-child(${i + 1})`); await rec(2.2); }

/* 4. Стрельба: соперник впереди на линии, заряды догоняют и тормозят его */
await openRace('race.html?level=1&debug');
await page.evaluate(() => {
  let s = 700; while (!__clear(s - 20, 200) && s < 2400) s += 20;
  __tp(s, 60, 0, -1); __bots([30, -200, -230], 0.95, [0.5, 6, -6], [-1, 0, 0]);
  __mode = 'steer'; __steer = [0, 0];
  const R = __race, b = __botsList[0];
  window.__keepAim = () => { b.p.x += (R.mine.p.x - b.p.x) * 0.3; b.p.y += (R.mine.p.y - b.p.y) * 0.3; if (b.p.s - R.mine.p.s < 18) b.p.s = R.mine.p.s + 18; };
});
await cap('<b>СТРЕЛЯЙ!</b>'); voice('u4');
let shotT = 0;
await rec(9, async (t) => {
  await page.evaluate((fire) => { __keepAim(); if (fire) { __race.mine.p.gun = 0; __race.shoot(__race.mine); } }, (shotT++ % 14) === 3);
}, 0.6);

/* 5. Конструктор: трасса растёт блок за блоком */
const ex = EXAMPLES[0], chain = analyze(ex).routes[0].chain;
const keep = new Map([...ex.blocks].filter(([k]) => chain.indexOf(k) < 6));
await openFramed(`race-editor.html?debug&code=${encodeURIComponent(encode({ ...ex, blocks: keep }))}`);
await scene.evaluate(() => { __ed.camera.position.set(14 * 28, 9 * 28, -7 * 28); __ed.look(Math.PI, -0.72); });
await cap('СТРОЙ ТРАССЫ<br><b>ИЗ БЛОКОВ!</b>'); voice('u5');
let put = 6;
await rec(8, async (t) => {
  if (put < chain.length && Math.random() < 2) {
    const k = chain[put++];
    await scene.evaluate(([k, ty]) => __ed.put(k, ty), [k, ex.blocks.get(k)]);
  }
  await scene.evaluate((t) => { __ed.camera.position.x = (14 - t * 2) * 28; __ed.camera.position.z = (-7 + t * 3) * 28; }, t);
});

/* 6. Развилки: сверху, затем полёт в развилку */
const ex2 = EXAMPLES[1];
await openFramed(`race-editor.html?debug&code=${encodeURIComponent(encode(ex2))}`);
await scene.evaluate(() => { __ed.camera.position.set(14 * 28, 13 * 28, -4 * 28); __ed.look(Math.PI, -0.95); });
await cap('<b>РАЗВИЛКИ!</b>'); voice('u6');
await rec(4, (t) => scene.evaluate((t) => { __ed.camera.position.z = (-4 + t * 2) * 28; }, t));
await openRace(`race.html?debug&code=${encodeURIComponent(encode(ex2))}`);
await page.evaluate(() => {
  const R = __race, f = R.track.forks[0], side = f.opts.find((q) => Math.hypot(q.dx, q.dy) > 1);
  __tp(f.s - 110, 55); __bots([-400, -420, -440], 0.5);
  __mode = 'steer';
  const l = Math.hypot(side.dx, side.dy); __steer = [side.dx / l, side.dy / l];
});
await rec(5);
await page.evaluate(() => { __mode = 'pilot'; });
await rec(2);

/* 7. «Достроить»: нажал — дорога дошла до финиша */
const stub = new Map([[keyOf(14, 0, 6), T.start], [keyOf(15, 0, 6), T.path], [keyOf(16, 0, 6), T.path], [keyOf(17, 0, 6), T.path]]);
await openFramed(`race-editor.html?debug&code=${encodeURIComponent(encode({ a: 3, b: 6, d: 'easy', blocks: stub }))}`);
await scene.evaluate(() => { __ed.camera.position.set(16 * 28, 9 * 28, -2 * 28); __ed.look(Math.PI, -0.95); });
await cap('НЕ ДОСТРОИЛ?<br><b>ИГРА ПОМОЖЕТ!</b>'); voice('u7');
await rec(3);
await tapIn('#btn-fix');
await rec(5);

/* 8. С друзьями: четверо рядом, вид сбоку, и финишная вспышка */
await openRace(`race.html?debug&code=${encodeURIComponent(encode(EXAMPLES[2]))}`);
await page.evaluate(() => { let s = 400; while (!__clear(s - 30, 120) && s < 2000) s += 20; __tp(s, 75); __bots([-4, 5, 9], 1, [6, -6, 0], [1, 0, -6]); __orbit(24, 0.8, 2); });
await cap('ВМЕСТЕ<br><b>С ДРУЗЬЯМИ!</b>'); voice('u8');
music(2);
await rec(7, (t) => page.evaluate((t) => __orbit(24 + t * 8, 0.8 + t * 1.6, 2), t));
await cap('');
await page.evaluate(() => { const f = document.getElementById('__flash'); f.style.transition = 'none'; f.style.opacity = 0.9; void f.offsetWidth; f.style.transition = ''; f.style.opacity = 0; });
await rec(1);

/* 9. Концовка с кодом и ссылкой */
const end = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', CARD, '-vf', `scale=${W}:${H}:flags=lanczos`, '-q:v', '2', '-f', 'mjpeg', '-'], { maxBuffer: 1 << 27 });
music(1);
voice('u9');
for (let i = 0; i < 5 * FPS; i++) { await write(end); total++; }
ff.stdin.end();
await new Promise((r) => ff.on('close', r));

/* ── звук: музыка и эффекты игры, голос поверх, музыка приглушается под голос ── */
const dur = total / FPS;
await page.goto(`${BASE}/index.html`);
const raw = await page.evaluate(async (dur, sfxLog, musicAt) => {
  const { renderSfx, renderBar, BAR } = await import('/src/audio.js');
  const c = new OfflineAudioContext(2, Math.ceil(dur * 44100), 44100);
  const mus = c.createGain(); mus.gain.value = 0.5; mus.connect(c.destination);
  const fx = c.createGain(); fx.gain.value = 0.85; fx.connect(c.destination);
  const lv = (t) => { let l = 1; for (const [at, v] of musicAt) if (at <= t + 0.01) l = v; return l; };
  for (let b = 0, t = 0; t < dur; b++, t += BAR) renderBar(c, mus, t, b, lv(t));
  for (const [t, name, k] of sfxLog) renderSfx(c, name, t, fx, k);
  const b = await c.startRendering();
  const L = b.getChannelData(0), Rr = b.getChannelData(1), out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { out[i * 2] = L[i]; out[i * 2 + 1] = Rr[i]; }
  let s = ''; const u = new Uint8Array(out.buffer); const step = 0x8000;
  for (let i = 0; i < u.length; i += step) s += String.fromCharCode.apply(null, u.subarray(i, i + step));
  return btoa(s);
}, dur, sfxLog, musicAt);
await br.close();
const bedF = path.join(os.tmpdir(), `tails-update-bed-${process.pid}.raw`);
fs.writeFileSync(bedF, Buffer.from(raw, 'base64'));
const inputs = voices.flatMap(([k]) => ['-i', `store/video/update/${k}.mp3`]);
const delays = voices.map(([, at], i) => `[${i + 2}:a]adelay=${Math.round(at * 1000)}:all=1,volume=1.5[v${i}]`).join(';');
const fc = `${delays};${voices.map((_, i) => `[v${i}]`).join('')}amix=inputs=${voices.length}:normalize=0:dropout_transition=0,apad=whole_dur=${dur.toFixed(2)},asplit[vo][key];`
  + `[1:a][key]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=300[bed];[bed][vo]amix=inputs=2:normalize=0:dropout_transition=0,loudnorm=I=-14:TP=-1:LRA=11,afade=t=out:st=${(dur - 0.6).toFixed(2)}:d=0.6,apad[a]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', SILENT, '-f', 'f32le', '-ar', '44100', '-ac', '2', '-i', bedF, ...inputs,
  '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT]);
fs.unlinkSync(SILENT); fs.unlinkSync(bedF);
console.log(`готово: ${OUT}, ${dur.toFixed(1)} с, звуков ${sfxLog.length}`, errs.length ? errs.slice(0, 3) : 'без ошибок');
