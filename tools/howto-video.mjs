#!/usr/bin/env node
/**
 * Ролик «Как играть»: покадровая съёмка настоящей игры в браузере (своё время страницы, поэтому плавно и без видеокарты).
 * Текст — tools/howto-script.json, голос — store/video/vo/<реплика>.mp3 (~/VIDEO/silero/speak.py); сцена длится столько, сколько реплика.
 * Сервер: PORT=8795 node server/index.js. Запуск: node tools/howto-video.mjs [файл.mp4]  → store/video/tails-howto.mp4
 */
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8795', OUT = process.argv[2] || 'store/video/tails-howto.mp4', FPS = 25, W = 1280, H = 720;
const SCRIPT = JSON.parse(fs.readFileSync('tools/howto-script.json', 'utf8'));
const voDur = (k) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `store/video/vo/${k}.mp3`]).toString());
const SILENT = path.join(os.tmpdir(), `tails-howto-${process.pid}.mp4`);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', SILENT], { stdio: ['pipe', 'inherit', 'inherit'] });
const write = (b) => new Promise((r) => (ff.stdin.write(b) ? r() : ff.stdin.once('drain', r)));

const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await br.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument((profile) => {
  localStorage.setItem('tg.me', JSON.stringify(profile));
  localStorage.setItem('tails.voice', '0');
  // своё время страницы: кадр за кадром, сколько бы ни занимала отрисовка
  const real = { now: performance.now.bind(performance), raf: requestAnimationFrame.bind(window), st: setTimeout.bind(window), dn: Date.now.bind(Date) };
  let on = false, vt = 0, base = 0, raf = [], timers = [], id = 1;
  performance.now = () => (on ? vt : real.now());
  Date.now = () => (on ? base + vt : real.dn());
  window.requestAnimationFrame = (f) => { if (!on) return real.raf(f); raf.push(f); return id++; };
  window.setTimeout = (f, ms = 0, ...a) => { if (!on) return real.st(f, ms, ...a); const t = { id: id++, at: vt + ms, f, a }; timers.push(t); return t.id; };
  const oc = clearTimeout.bind(window);
  window.clearTimeout = (x) => { timers = timers.filter((t) => t.id !== x); oc(x); };
  window.__vt = {
    start() { vt = real.now(); base = real.dn() - vt; on = true; },
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
    st.textContent = `#__cap{pointer-events:none;position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:99;width:max-content;max-width:60vw;padding:14px 28px;border-radius:22px;
      background:#06192bf2;border:3px solid #ffd447;color:#fff;font:800 27px/1.25 "Segoe UI",system-ui,sans-serif;text-align:center;box-shadow:0 18px 44px #04121ea8}
      #__cap b{color:#ffd447}#__cap:empty{display:none}
      #__big{pointer-events:none;position:fixed;inset:0;z-index:98;display:grid;place-content:center;justify-items:center;gap:14px;background:#06192bd9;color:#fff;font:900 70px/1.1 "Segoe UI",system-ui,sans-serif;text-align:center}
      #__big small{font-size:30px;font-weight:700;color:#cfe6f0;line-height:1.35}#__big b{color:#ffd447}#__big:empty{display:none}
      #toast{display:none!important}`;
    document.head.append(st);
    document.body.insertAdjacentHTML('beforeend', '<div id="__big"></div><div id="__cap"></div>');
  });
}, { name: 'Алиса', color: '#ff6f91', emoji: '🦊', hero: 'maskot', tint: '#8fd0ff' });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

let total = 0;
const shot = () => page.screenshot({ type: 'jpeg', quality: 88 });
// подпись не закрывает то, о чём говорит: в игре — под верхней строкой (кнопки внизу), в профиле — под персонажем
const cap = (t) => page.evaluate((t) => {
  const el = document.getElementById('__cap');
  el.innerHTML = t;
  if (location.pathname.endsWith('play.html')) { el.style.bottom = 'auto'; el.style.top = '72px'; }
  if (location.pathname.endsWith('profile.html')) { el.style.left = '25%'; el.style.maxWidth = '44vw'; el.style.width = '44vw'; el.style.bottom = '24px'; }
}, t);
const big = (t) => page.evaluate((t) => { document.getElementById('__big').innerHTML = t; }, t);
/** Реплика: подпись на экран, голос в это место ролика. rest() досматривает сцену до конца реплики. */
const cues = [];
let cueEnd = 0;
async function say(key) {
  cues.push({ key, at: total / FPS });
  cueEnd = total + Math.ceil((voDur(key) - 0.45) * FPS);   // хвост эха ложится на начало следующей сцены
  await cap(SCRIPT[key].cap);
}
const left = () => Math.max(0, (cueEnd - total) / FPS);
async function rest(each) { await live(left(), each); }
async function restStill() { await still(left()); }
/** Живые кадры: each(i) вызывается на каждом кадре. */
async function live(sec, each) {
  for (let i = 0; i < sec * FPS; i++) {
    if (each) await each(i);
    await page.evaluate((ms) => window.__vt.frame(ms), 1000 / FPS);
    await write(await shot());
    total++;
  }
  console.log(`  кадров ${total} (${(total / FPS).toFixed(0)} с)`);
}
/** Неподвижный экран. */
async function still(sec) {
  const b = await shot();
  for (let i = 0; i < sec * FPS; i++) { await write(b); total++; }
}
const open = async (url) => { await page.goto(`${BASE}/${url}`, { waitUntil: 'load' }); await new Promise((r) => setTimeout(r, 700)); };

/* ── меню ── */
await open('index.html');
await big('Хвосты<small>Как играть и какие правила</small>');
await say('intro'); await restStill();
await big('');
await say('menu'); await restStill();

/* ── профиль ── */
await open('profile.html');
await page.waitForFunction(() => document.getElementById('stage-hint').textContent !== 'Загружаем…', { timeout: 60000 });
await page.evaluate(() => window.__vt.start());
await say('profile');
await live(0.6);
await page.click('#heroes [data-v="ghost"]');
await live(0.7);
await page.click('#tints [data-v="#9be37a"]');
await live(0.7);
await page.click('#heroes [data-v="maskot"]');
await new Promise((r) => setTimeout(r, 800));
await page.click('#tints [data-v="#8fd0ff"]');
await new Promise((r) => setTimeout(r, 300));
await rest();

/* ── игра ── */
await open('play.html?map=castle&level=1&debug&joy');
await page.waitForFunction(() => document.getElementById('loading').classList.contains('done') && window.__td && window.__td.runner, { timeout: 120000 });
await page.evaluate(() => {
  window.__vt.start();
  // рули джойстиком к точке в мире, как настоящий игрок
  const fwd = { x: 0, z: 0 };
  window.__steer = (tx, tz, stop = 1.5) => {
    const { runner: r, joy, controls, camera } = __td;
    const dx = tx - r.root.position.x, dz = tz - r.root.position.z, l = Math.hypot(dx, dz);
    if (l < stop) { joy.active = false; joy.x = joy.y = 0; return l; }
    const fx = controls.target.x - camera.position.x, fz = controls.target.z - camera.position.z, fl = Math.hypot(fx, fz) || 1;
    fwd.x = fx / fl; fwd.z = fz / fl;
    joy.active = true;
    joy.x = (dx / l) * -fwd.z + (dz / l) * fwd.x;
    joy.y = (dx / l) * fwd.x + (dz / l) * fwd.z;
    return l;
  };
  window.__nearest = () => {
    const { sim, runner: r } = __td; let b = null, bd = 1e9;
    for (const e of sim.enemies) { const d = Math.hypot(e.x - r.root.position.x, e.z - r.root.position.z); if (d < bd) { bd = d; b = e; } }
    return b;
  };
});
await say('goal'); await rest();
await say('build');
const spots = await page.evaluate(() => __td.SPOTS.map((s) => [s.x, s.z]));
const home = await page.evaluate(() => { const p = __td.runner.root.position; return [p.x, p.z]; });
const nearest = spots.map((s, i) => [Math.hypot(s[0] - home[0], s[1] - home[1]), i]).sort((a, b) => a[0] - b[0])[0][1];
await live(Math.max(1, left() - 2.2), () => page.evaluate(([x, z]) => { __steer(x, z, 4); }, spots[nearest]));
await page.evaluate((s) => { __td.joy.active = false; __td.joy.x = __td.joy.y = 0; __td.showBuild(s); }, nearest);
await live(1.4);
await page.evaluate((s) => { __td.doAct({ k: 'build', s, f: 'castle' }); document.getElementById('build').classList.remove('show'); }, nearest);
await rest();
await say('grow');
await page.evaluate((s) => { __td.sim.players.get(1).shells += 120; __td.doAct({ k: 'up', s }); }, nearest);
await live(left() / 2);
await page.evaluate((s) => __td.doAct({ k: 'up', s }), nearest);
await rest();
await page.evaluate(() => { const s = __td.sim, free = s.spots.map((_, i) => i).filter((i) => !s.towers.has(i)).slice(0, 2); s.players.get(1).shells += 100; for (const i of free) __td.doAct({ k: 'build', s: i, f: 'castle' }); });
await say('wave');
await page.evaluate(() => __td.doAct({ k: 'wave' }));
await rest();
await live(1.5);
await page.evaluate(() => {   // ближе к персонажу: дальше сцены про него
  const { camera, controls } = __td;
  camera.position.sub(controls.target).multiplyScalar(0.62).add(controls.target);
});
await say('hop');
let t = 0;
await rest(async () => {
  t += 1 / FPS;
  await page.evaluate((a) => {
    const { runner: r } = __td;
    __steer(Math.cos(a) * 26, Math.sin(a) * 26, 0);
    if (!r.air || r.vy < -6) r.jump();
  }, t * 0.9);
});
const chase = () => page.evaluate(() => {
  const s = __td.sim;
  if (!s.enemies.length && !s.queue.length && s.nextWaveAt < 0) __td.doAct({ k: 'wave' });
  const e = __nearest(); if (!e) { __td.joy.active = false; __td.joy.x = __td.joy.y = 0; return; }
  const l = __steer(e.x, e.z, 3); const me = s.players.get(1);
  if (l < 5 && me.hitReady <= s.time && !me.down) __td.doAct({ k: 'hit', air: __td.runner.air ? 1 : 0 });
});
await say('hit'); await rest(chase);
await say('kill'); await rest(chase);
await say('hurt');
await page.evaluate(() => { const me = __td.sim.players.get(1); me.lives = Math.min(me.lives, 3); });
await rest(() => page.evaluate(() => { const e = __nearest(); if (e) __steer(e.x, e.z, 1); }));
await say('dance');
await page.evaluate(() => { __td.joy.active = false; __td.joy.x = __td.joy.y = 0; __td.doAct({ k: 'dance' }); });
await rest();

/* ── команда ── */
await open('lobby.html');
await say('team'); await restStill();
await page.click('#btn-create');
await page.waitForFunction(() => !document.getElementById('room-panel').hidden, { timeout: 10000 });
await new Promise((r) => setTimeout(r, 300));
await say('team2'); await restStill();
await page.click('#btn-leave').catch(() => {});

/* ── редактор ── */
await open('editor.html?debug');
await page.waitForFunction(() => document.getElementById('loading').classList.contains('done') && window.__ed, { timeout: 60000 });
await page.evaluate(() => { window.__vt.start(); });
await say('editor');
await live(left() / 2);
await page.select('#ghosts', 'many');
await rest();

/* ── конец ── */
await open('index.html');
await big('Защити домик!<small>Башни дают <b>ракушки 🐚</b> · удары стоят <b>жизни ❤️</b> · победы над монстрами их возвращают</small>');
await say('end');
await restStill();
await still(0.8);
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await br.close();
// голос: каждая реплика на своё место
const inputs = cues.flatMap((c) => ['-i', `store/video/vo/${c.key}.mp3`]);
const delays = cues.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.at * 1000)}:all=1[a${i}]`).join(';');
const mix = `${delays};${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95[a]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', SILENT, ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT]);
fs.unlinkSync(SILENT);
console.log(`готово: ${OUT}, ${(total / FPS).toFixed(0)} с`, errs.length ? errs.slice(0, 3) : 'без ошибок');
