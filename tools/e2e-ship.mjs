#!/usr/bin/env node
/**
 * Баллы и мастерская корабля: задания «Редактора с заданиями» дают ⭐, за них покупаются ачивки,
 * надетое видно на корабле в гонке и уходит другим через сервер. Сервер должен быть запущен.
 *   node tools/e2e-ship.mjs [URL]
 */
import puppeteer from 'puppeteer-core';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, encode, keyOf, T } from '../src/race-design.js';

const BASE = process.argv[2] || 'http://127.0.0.1:8795';
const SHOTS = path.join(os.homedir(), 'tails-shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? '✔' : '✘'} ${what}`); if (!ok) fails++; };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/snap/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 180000 });
const errors = [];
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 800, height: 360, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/400|403/.test(m.text())) errors.push(m.text()); });
page.on('dialog', (d) => d.accept());

/* за пример баллов нет: правим копию — ноль */
await page.goto(`${BASE}/race-editor.html?quest=1&debug&code=${encodeURIComponent(encode(EXAMPLES[1]))}`);
await page.waitForFunction(() => window.__ed);
await page.evaluate((k) => __ed.put(k, 0), keyOf(30, 0, 30));
check(await page.$eval('#quest', (e) => !e.hidden) && await page.evaluate(() => __ed.points.balance()) === 0, 'панель заданий видна; за правку чужой трассы или примера баллов нет');
/* своя трасса с нуля: строим блоками — засчитываются задания */
await page.goto(`${BASE}/race-editor.html?quest=1&debug&new=1`);
await page.waitForFunction(() => window.__ed);
await page.evaluate((list) => { for (const [k] of [...__ed.blocks]) __ed.put(k, -1); for (const [k, t] of list) __ed.put(k, t); }, [...EXAMPLES[1].blocks]);
await sleep(200);
const got = await page.evaluate(() => [__ed.points.balance(), __ed.points.state().done]);
check(got[0] > 0 && got[1].includes('ready') && got[1].includes('fork'), `за правку засчитались задания: ⭐${got[0]} (${got[1].join(', ')})`);
await page.$eval('#quest-head', (b) => b.click());
await page.screenshot({ path: path.join(SHOTS, 'quest-editor.png') });
check((await page.$$eval('#quest-list .t.done', (e) => e.length)) === got[1].length, 'выполненные задания отмечены галочкой');

/* мастерская: не хватает — не купить; хватает — купили и надели */
await page.goto(`${BASE}/ship.html?debug`);
await page.waitForFunction(() => window.__ship && window.__ship.ship);
const bal0 = await page.evaluate(() => __ship.points.balance());
await page.evaluate(() => document.querySelector('[data-id="badge-ace"]').click());
check(await page.evaluate(() => !__ship.points.owns('badge-ace')) && bal0 < 120, `дорогой значок за ⭐120 при ⭐${bal0} не покупается`);
await page.evaluate(() => document.querySelector('[data-id="trail-blue"]').click());
await page.evaluate(() => document.querySelector('[data-id="emblem-star"]').click());
const after = await page.evaluate(() => [__ship.points.balance(), __ship.points.owns('trail-blue'), __ship.points.owns('emblem-star'), JSON.parse(localStorage.getItem('tg.me')).kit]);
check(after[1] && after[2] && after[0] === bal0 - 40 && after[3].trail === 'trail-blue' && after[3].emblem === 'emblem-star', `купили и надели: синий след и звезду, осталось ⭐${after[0]}`);
await page.evaluate(() => document.querySelector('[data-slot="ship"] [data-id="delta"]').click());
await sleep(400);
await page.screenshot({ path: path.join(SHOTS, 'ship-workshop.png') });
const fit = await page.$$eval('.items button', (els) => els.every((e) => { const r = e.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.width >= 44; }));
check(fit, 'кнопки мастерской в экране телефона и не мельче 44 пикселей');

/* в гонке: корабль с ачивками, и они уходят на сервер */
await page.goto(`${BASE}/race.html?level=1&debug`);
await page.waitForFunction(() => window.__race && document.getElementById('loading').classList.contains('done'), { timeout: 120000 });
const kit = await page.evaluate(() => [window.__race.mine.kit, window.__race.mine.r.root.children.some((c) => c.children && c.children.some((m) => m.material && m.material.map))]);
check(kit[0].trail === 'trail-blue' && kit[1], 'в гонке корабль с надетыми ачивками (эмблема на рубке)');
await ctx.close();
check(errors.length === 0, `консоль без ошибок${errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''}`);
await browser.close();
process.exit(fails ? 1 : 0);
