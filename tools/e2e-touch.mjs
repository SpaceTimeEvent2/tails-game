#!/usr/bin/env node
/**
 * Проверка управления пальцами на экране телефона (настоящие touch-события через CDP):
 * прыжок на бегу, промах мимо кнопки, плавающий джойстик, редактор: всё в экране, мазок, отмена, щипок.
 * Скриншоты → ~/tails-shots/touch-*.png
 */
import puppeteer from 'puppeteer-core';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8795';
const SHOTS = path.join(os.homedir(), 'tails-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? '✔' : '✘'} ${what}`); if (!ok) fails++; };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/snap/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function open(url, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await page.createCDPSession();
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  await page.goto(BASE + url);
  return { page, touch };
}
const center = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.left, r.top, r.right, r.bottom]; });

/* ── игра ── */
{
  const { page, touch } = await open('/play.html?map=castle&level=1&debug', 800, 360);
  await page.waitForFunction(() => window.__td && window.__td.runner && document.getElementById('loading').classList.contains('done'), { timeout: 60000 });
  await page.evaluate(() => {
    window.__air = false;
    setInterval(() => { if (window.__td.runner.air) window.__air = true; }, 10);
    window.__hits = 0;
    document.getElementById('btn-hit').addEventListener('click', () => window.__hits++);
  });
  const camOff = () => page.evaluate(() => { const { camera: c, controls: t } = window.__td; return [c.position.x - t.target.x, c.position.y - t.target.y, c.position.z - t.target.z]; });
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const settle = () => sleep(700);

  // бежим и жмём «Прыжок» вторым пальцем
  const [jx, jy, jl] = await center(page, '#btn-jump');
  const [sx, sy] = await center(page, '#joy');
  const p0 = await page.evaluate(() => window.__td.runner.root.position.toArray());
  await touch('touchStart', [[sx, sy, 1]]);
  await touch('touchMove', [[sx + 40, sy - 10, 1]]);
  await sleep(700);
  check(await page.evaluate(() => window.__td.joy.active), 'джойстик держится');
  await touch('touchStart', [[sx + 40, sy - 10, 1], [jx, jy, 2]]);
  // при программной отрисовке кадры редкие: прыжок виден не сразу
  const jumped = await page.waitForFunction(() => window.__air, { timeout: 3000 }).then(() => true, () => false);
  check(jumped, 'прыжок вторым пальцем, пока держим джойстик');
  await touch('touchMove', [[sx + 40, sy - 10, 1]]);   // палец 2 отпущен: в списке только палец 1
  check(await page.evaluate(() => window.__td.joy.active), 'после отпускания кнопки бег не прервался');
  await touch('touchEnd', []);
  const p1 = await page.evaluate(() => window.__td.runner.root.position.toArray());
  check(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 1, 'персонаж при этом бежал');
  await settle();

  // промах мимо «Прыжка»: палец рядом и ещё съехал
  await page.evaluate(() => { window.__air = false; });
  const off0 = await camOff();
  const missX = jl + 10, missY = (await center(page, '#btn-jump'))[3] - 30;   // на 30 px выше кнопки
  await touch('touchStart', [[missX, missY, 1]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[missX - i * 15, missY - i * 5, 1]]); await sleep(16); }
  await touch('touchEnd', []);
  await settle();
  check(dist(off0, await camOff()) < 0.01, 'промах рядом с кнопкой не двигает камеру');
  check(await page.evaluate(() => window.__air), 'промах рядом с «Прыжком» всё равно прыжок');

  // одно нажатие — одно срабатывание
  const [hx, hy] = await center(page, '#btn-hit');
  await touch('touchStart', [[hx, hy, 1]]); await sleep(60); await touch('touchEnd', []);
  await sleep(500);
  check(await page.evaluate(() => window.__hits) === 1, `«Удар» сработал один раз (${await page.evaluate(() => window.__hits)})`);

  // рядом с «Волной» волна не запускается
  const wave0 = await page.evaluate(() => window.__td.view.wave);
  const w = await center(page, '#btn-wave');
  await touch('touchStart', [[w[2] - 28, w[1], 1]]); await touch('touchEnd', []);   // на 28 px левее: вплотную браузер сам считает это нажатием кнопки
  await sleep(300);
  check(await page.evaluate(() => window.__td.view.wave) === wave0, 'касание рядом с «Волной» её не запускает');

  // свободное место — камера крутится как раньше
  const off1 = await camOff();
  await touch('touchStart', [[420, 120, 1]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[420 + i * 12, 120, 1]]); await sleep(16); }
  await touch('touchEnd', []);
  await settle();
  check(dist(off1, await camOff()) > 1, 'поворот камеры на свободном месте работает');

  // джойстик под пальцем в левой части экрана
  const fx = 260, fy = 170;
  await touch('touchStart', [[fx, fy, 1]]);
  await touch('touchMove', [[fx + 30, fy, 1]]);
  await sleep(100);
  const fj = await page.evaluate(() => { const j = window.__td.joy; const r = document.getElementById('joy').getBoundingClientRect(); return { a: j.active, x: j.x, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
  check(fj.a && fj.x > 0.5 && Math.hypot(fj.cx - fx, fj.cy - fy) < 2, 'джойстик появился под пальцем и работает');
  await page.screenshot({ path: path.join(SHOTS, 'touch-play.png') });
  await touch('touchEnd', []);
  await page.close();
}

/* ── редактор ── */
for (const [width, height, label] of [[800, 360, 'лёжа'], [640, 320, 'маленький лёжа'], [360, 740, 'стоя']]) {
  const { page, touch } = await open('/editor.html?debug&new=1', width, height);
  await page.waitForFunction(() => window.__ed && document.getElementById('loading').classList.contains('done'), { timeout: 60000 });
  await sleep(700);
  const out = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight, bad = [];
    for (const el of document.querySelectorAll('#tools button, #rail > *, #st-mini')) {
      const r = el.getBoundingClientRect();
      if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5 || r.width < 30 || r.height < 30 && el.id !== 'st-mini') bad.push(el.id || el.dataset.tool);
    }
    return bad;
  });
  check(out.length === 0, `${label}: панели в экране${out.length ? ': ' + out : ''}`);
  const screen = (i, j) => page.evaluate((i, j) => {
    const ed = window.__ed, [x, z] = ed.grid.center(ed.grid.idx(i, j));
    const v = ed.camera.position.clone().set(x, 0, z).project(ed.camera);
    const r = document.getElementById('scene').getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height, r.left, r.top, r.right, r.bottom];
  }, i, j);
  const ends = await Promise.all([[0, 0], [14, 0], [0, 12], [14, 12]].map(([i, j]) => screen(i, j)));
  check(ends.every((p) => p[0] > p[2] && p[0] < p[4] && p[1] > p[3] && p[1] < p[5]), `${label}: все углы поля в холсте`);

  // мазок дорогой, быстрый: события редкие, клетки не должны пропасть
  const road = () => page.evaluate(() => window.__ed.cells.filter((c) => c === '#').length);
  const a = await screen(2, 3), b = await screen(10, 3);
  await touch('touchStart', [[a[0], a[1], 1]]);
  await touch('touchMove', [[(a[0] + b[0]) / 2, a[1], 1]]);
  await sleep(40);
  await touch('touchMove', [[b[0], b[1], 1]]);
  await sleep(40);
  await touch('touchEnd', []);
  await sleep(200);
  check(await road() === 9, `${label}: мазок положил дорогу без дыр (${await road()} из 9)`);
  const off = await page.evaluate(() => window.__ed.camera.position.toArray());

  // отмена
  await page.evaluate(() => document.getElementById('btn-undo').click());
  await sleep(100);
  check(await road() === 0, `${label}: «Назад» убрал весь мазок`);

  // щипок: камера приближается, клетки не красятся
  const c0 = await page.evaluate(() => window.__ed.camera.position.length());
  const mx = (a[0] + b[0]) / 2, my = a[1] + 40;
  await touch('touchStart', [[mx - 30, my, 1], [mx + 30, my, 2]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[mx - 30 - i * 8, my, 1], [mx + 30 + i * 8, my, 2]]); await sleep(16); }
  await touch('touchEnd', []);
  await sleep(600);
  const c1 = await page.evaluate(() => window.__ed.camera.position.length());
  check(await road() === 0 && c1 < c0 - 1, `${label}: щипок приблизил поле (${c0.toFixed(0)} → ${c1.toFixed(0)}) и ничего не нарисовал`);
  await page.evaluate(() => document.getElementById('r-fit').click());
  await sleep(400);
  const c2 = await page.evaluate(() => window.__ed.camera.position.toArray());
  check(Math.hypot(c2[0] - off[0], c2[1] - off[1], c2[2] - off[2]) < 1, `${label}: «Всё поле» вернул вид`);

  // весь уровень пальцем: выбрать инструмент и нажать
  const tap = async (i, j, t) => {
    await page.tap(`#tools [data-tool="${t}"]`);
    const p = await screen(i, j);
    await touch('touchStart', [[p[0], p[1], 1]]); await sleep(30); await touch('touchEnd', []); await sleep(60);
  };
  await page.tap('#tools [data-tool="road"]');
  const r0 = await screen(2, 6), r1 = await screen(12, 6);
  await touch('touchStart', [[r0[0], r0[1], 1]]);
  for (let s = 1; s <= 10; s++) { await touch('touchMove', [[r0[0] + ((r1[0] - r0[0]) * s) / 10, r0[1], 1]]); await sleep(16); }
  await touch('touchEnd', []);
  await sleep(100);
  await tap(1, 6, 'spawn');
  await tap(13, 6, 'house');
  await tap(4, 4, 'spot');
  await tap(8, 8, 'spot');
  await sleep(200);
  check(await page.$eval('#st-mini', (e) => e.className === 'ok'), `${label}: уровень пальцем готов: «${await page.$eval('#st-mini', (e) => e.textContent)}»`);
  await page.screenshot({ path: path.join(SHOTS, `touch-editor-${width}.png`) });
  await page.tap('#r-more');
  await page.evaluate(() => Promise.all(document.getElementById('side').getAnimations().map((x) => x.finished)));
  await sleep(100);
  const side = await page.evaluate(() => { const r = document.getElementById('side').getBoundingClientRect(); return [r.left, r.right, r.height, innerWidth, innerHeight]; });
  check(side[0] >= 0 && side[1] <= side[3] + 0.5 && side[2] <= side[4] + 0.5, `${label}: панель настроек в экране ${side.map(Math.round)}`);
  await page.screenshot({ path: path.join(SHOTS, `touch-editor-${width}-side.png`) });
  await page.tap('#side-close');
  await sleep(300);
  await page.tap('#r-save');
  await sleep(150);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('tg.my.levels') || '[]').length >= 1), `${label}: «Сохранить» сработал`);
  if (width === 800) {
    await page.tap('#r-play');
    await page.waitForFunction(() => window.__td && document.getElementById('loading').classList.contains('done'), { timeout: 60000 }).catch(() => {});
    check(await page.evaluate(() => !!window.__td), `${label}: «Играть» открыл уровень`);
  }
  await page.close();
}

check(errors.length === 0, `консоль без ошибок${errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''}`);
await browser.close();
process.exit(fails ? 1 : 0);
